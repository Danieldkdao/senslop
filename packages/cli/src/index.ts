#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  cancel,
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import { simpleGit } from "simple-git";
import { runWorkspace } from "./features/workspace/run-workspace.js";
import { collectSnapshot } from "./features/git/snapshot.js";
import { requireCredentials } from "./features/auth/credentials.js";
import { fetchStatus } from "./features/connection/fetch-status.js";
import { login } from "./features/auth/login.js";
import { logout } from "./features/auth/logout.js";
import {
  sourceSelectionSchema,
  secureBaseURL,
  type SourceSelectionSchema,
} from "@senslop/contracts";

export const HELP = `Senslop — understand your local code changes

Usage: senslop COMMAND [options]

  login [--url URL]   Sign in with a browser-approved device code
  connect             Open the local workspace and inspect in this terminal
  status              Check your saved account credential
  logout              Revoke and remove the CLI credential
  inspect --commit REF        Inspect one commit (first-parent delta)
  inspect --range BASE..HEAD   Inspect an endpoint-to-endpoint range
  inspect --working-tree      Inspect staged, unstaged and untracked text
  inspect --branch NAME [--base REF]  Compare HEAD or REF to a branch

Run without arguments for a command menu. Interactive inspect prompts for its source.
Options: --dev (connect/inspect; source checkout), --json (inspect; requires an explicit source), --help, --version

Connect and inspect start the bundled local Next.js app without account login.
Keep this terminal open; Ctrl+C stops the app. Source stays on this computer.
Add --json to print a snapshot without starting the app.
Inspection accepts small selections; JSON output includes future review eligibility.
`;

export const parseCommand = (args: string[]) => {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      url: { type: "string" },
      commit: { type: "string" },
      range: { type: "string" },
      branch: { type: "string" },
      base: { type: "string" },
      "working-tree": { type: "boolean" },
      json: { type: "boolean" },
      dev: { type: "boolean" },
    },
  });
  const command = parsed.positionals[0];
  if (parsed.positionals.length > 1)
    throw new Error(
      "Use one command; source revisions go in --commit or --range.",
    );
  if (parsed.values.version)
    return { command: "version" as const, values: parsed.values };
  if (parsed.values.help || !command)
    return { command: "help" as const, values: parsed.values };
  if (!["login", "connect", "status", "logout", "inspect"].includes(command))
    throw new Error(`Unknown command: ${command}. Run senslop --help.`);
  const allowed: Record<string, string[]> = {
    login: ["url"],
    connect: ["dev"],
    status: [],
    logout: [],
    inspect: [
      "commit",
      "range",
      "branch",
      "base",
      "working-tree",
      "json",
      "dev",
    ],
  };
  for (const option of Object.keys(parsed.values))
    if (!allowed[command].includes(option))
      throw new Error(`--${option} is not valid for ${command}.`);
  if (parsed.values.dev && parsed.values.json)
    throw new Error(
      "--dev cannot be combined with --json; JSON inspection does not start an app.",
    );
  return { command, values: parsed.values };
};

export const sourceFromOptions = (values: {
  commit?: string;
  range?: string;
  branch?: string;
  base?: string;
  "working-tree"?: boolean;
}): SourceSelectionSchema => {
  if (
    [
      values.commit !== undefined,
      values.range !== undefined,
      values.branch !== undefined,
      values["working-tree"] === true,
    ].filter(Boolean).length !== 1
  )
    throw new Error(
      "Choose exactly one of --commit, --range, --branch or --working-tree.",
    );
  if (values.base !== undefined && values.branch === undefined)
    throw new Error("--base can only be used with --branch.");
  if (values.branch !== undefined)
    return sourceSelectionSchema.parse({
      kind: "branch",
      branch: values.branch,
      base: values.base ?? "HEAD",
    });
  if (values.commit !== undefined)
    return sourceSelectionSchema.parse({
      kind: "commit",
      commit: values.commit,
    });
  if (values.range !== undefined) {
    const pair = values.range.split("..");
    if (
      pair.length !== 2 ||
      !pair[0] ||
      !pair[1] ||
      pair.some((p) => p.includes(".") && p.startsWith("."))
    )
      throw new Error(
        "Use an endpoint range BASE..HEAD, not a three-dot comparison.",
      );
    return sourceSelectionSchema.parse({
      kind: "range",
      base: pair[0],
      head: pair[1],
    });
  }
  return { kind: "working-tree" };
};

const promptSource = async (
  signal?: AbortSignal,
): Promise<SourceSelectionSchema | null> => {
  const kind = await select({
    message: "Which changes would you like to inspect?",
    signal,
    options: [
      { value: "working-tree" as const, label: "Uncommitted changes" },
      { value: "commit" as const, label: "One commit" },
      { value: "range" as const, label: "A commit range" },
      { value: "branch" as const, label: "Compare HEAD to a local branch" },
    ],
  });
  if (isCancel(kind)) return null;
  if (kind === "working-tree") return { kind };
  if (kind === "branch") {
    const branches = await simpleGit(process.cwd()).branchLocal();
    const branch = await select({
      message: "Which branch should HEAD be compared to?",
      signal,
      options: branches.all.map((value) => ({ value, label: value })),
    });
    return isCancel(branch) ? null : { kind, branch, base: "HEAD" };
  }
  const revision = await text({
    message: kind === "commit" ? "Which commit?" : "Which range?",
    signal,
    placeholder: kind === "commit" ? "HEAD" : "HEAD~1..HEAD",
    initialValue: kind === "commit" ? "HEAD" : undefined,
    validate: (value) => {
      try {
        sourceFromOptions(
          kind === "commit" ? { commit: value ?? "" } : { range: value ?? "" },
        );
      } catch (error) {
        return (error as Error).message;
      }
    },
  });
  if (isCancel(revision)) return null;
  return sourceFromOptions(
    kind === "commit" ? { commit: revision } : { range: revision },
  );
};

const inspectFromPrompt = async (signal: AbortSignal) => {
  const source = await promptSource(signal);
  if (!source || signal.aborted) return null;
  const progress = spinner({ signal });
  progress.start("Freezing your selected Git changes…");
  try {
    const snapshot = await collectSnapshot({ cwd: process.cwd(), source });
    progress.stop("Local snapshot frozen.");
    return snapshot;
  } catch (error) {
    progress.error("Snapshot could not be collected.");
    throw error;
  }
};

export const main = async (args = process.argv.slice(2)) => {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!args.length && interactive) {
    const command = await select({
      message: "What would you like to do?",
      options: [
        { value: "login", label: "Sign in" },
        { value: "connect", label: "Open the local review workspace" },
        { value: "status", label: "Check account status" },
        { value: "inspect", label: "Inspect changes locally" },
        { value: "logout", label: "Sign out" },
      ],
    });
    if (isCancel(command)) {
      cancel("Cancelled.");
      return;
    }
    args = [command];
  }
  const { command, values } = parseCommand(args);
  if (command === "help") {
    console.log(HELP);
    return;
  }
  if (command === "version") {
    console.log("0.1.0");
    return;
  }
  if (!values.json) intro(`Senslop · ${command}`);
  if (command === "login") {
    let url = values.url;
    if (!url) {
      if (!interactive) throw new Error("Use senslop login --url WEBSITE_URL.");
      const value = await text({
        message: "What is your Senslop website URL?",
        placeholder: "http://localhost:3000",
        validate: (value) => {
          try {
            secureBaseURL(value ?? "");
          } catch (error) {
            return (error as Error).message;
          }
        },
      });
      if (isCancel(value)) {
        cancel("Cancelled. No credential saved.");
        return;
      }
      url = value;
    }
    if (await login(url))
      outro(
        "Cloud account connected. Local inspection also works without login.",
      );
    return;
  }
  if (command === "connect") {
    await runWorkspace({
      development: values.dev,
      interactive,
      inspect: inspectFromPrompt,
    });
    outro("Local app stopped.");
    return;
  }
  if (command === "logout") {
    await logout();
    outro("Signed out.");
    return;
  }
  if (command === "status") {
    const progress = spinner();
    progress.start("Checking your account…");
    try {
      const status = await fetchStatus(await requireCredentials());
      if (!status)
        throw new Error(
          "Account status unavailable. Check the service and sign in again if your credential expired.",
        );
      progress.stop("Account verified.");
      log.success(`Signed in as ${status.user.name} (${status.user.email}).`);
      outro(
        "Cloud account verified. Run senslop connect to open your local workspace.",
      );
    } catch (error) {
      progress.error("Could not verify the account.");
      throw error;
    }
    return;
  }
  const hasSource =
    values.commit !== undefined ||
    values.range !== undefined ||
    values.branch !== undefined ||
    values["working-tree"] === true;
  const source =
    !hasSource && interactive && !values.json
      ? await promptSource()
      : sourceFromOptions(values);
  if (!source) {
    cancel("Cancelled. No snapshot collected.");
    return;
  }
  const progress = values.json ? undefined : spinner();
  progress?.start("Freezing your selected Git changes…");
  let snapshot;
  try {
    snapshot = await collectSnapshot({ cwd: process.cwd(), source });
    progress?.stop("Local snapshot frozen.");
  } catch (error) {
    progress?.error("Snapshot could not be collected.");
    throw error;
  }
  if (!values.json) {
    await runWorkspace({
      development: values.dev,
      interactive,
      snapshot,
      inspect: inspectFromPrompt,
    });
    outro("Local app stopped.");
    return;
  }
  console.log(JSON.stringify(snapshot, null, 2));
  if (!snapshot.eligibility.eligible) process.exitCode = 2;
};

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    log.error(`Senslop: ${error.message}`, { output: process.stderr });
    process.exitCode = 1;
  });
