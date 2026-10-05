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
import { collectSnapshot } from "./features/git/snapshot.js";
import { requireCredentials } from "./features/auth/credentials.js";
import { fetchStatus } from "./features/connection/fetch-status.js";
import { login } from "./features/auth/login.js";
import { connect } from "./features/connection/connect.js";
import { logout } from "./features/auth/logout.js";
import {
  sourceSelectionSchema,
  secureBaseURL,
  type SourceSelectionSchema,
} from "@senslop/contracts";

export const HELP = `Senslop — understand your local code changes

Usage: senslop COMMAND [options]

  login [--url URL]   Sign in with a browser-approved device code
  connect             Keep CLI presence connected (Ctrl+C stops it)
  status              Check your saved account credential
  logout              Revoke and remove the CLI credential
  inspect --commit REF        Inspect one commit (first-parent delta)
  inspect --range BASE..HEAD   Inspect an endpoint-to-endpoint range
  inspect --working-tree      Inspect staged, unstaged and untracked text

Run without arguments for a command menu. Interactive inspect prompts for its source.
Options: --json (inspect; requires an explicit source), --help, --version

Inspection freezes a local snapshot; it does not upload or run AI.
A review needs five text files with ten added+deleted lines each.
Smaller changed files are still included. Review and sync arrive next.
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
      "working-tree": { type: "boolean" },
      json: { type: "boolean" },
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
    connect: [],
    status: [],
    logout: [],
    inspect: ["commit", "range", "working-tree", "json"],
  };
  for (const option of Object.keys(parsed.values))
    if (!allowed[command].includes(option))
      throw new Error(`--${option} is not valid for ${command}.`);
  return { command, values: parsed.values };
};

export const sourceFromOptions = (values: {
  commit?: string;
  range?: string;
  "working-tree"?: boolean;
}): SourceSelectionSchema => {
  if (
    [
      values.commit !== undefined,
      values.range !== undefined,
      values["working-tree"] === true,
    ].filter(Boolean).length !== 1
  )
    throw new Error(
      "Choose exactly one of --commit, --range or --working-tree.",
    );
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

const promptSource = async (): Promise<SourceSelectionSchema | null> => {
  const kind = await select({
    message: "Which changes would you like to inspect?",
    options: [
      { value: "working-tree" as const, label: "Uncommitted changes" },
      { value: "commit" as const, label: "One commit" },
      { value: "range" as const, label: "A commit range" },
    ],
  });
  if (isCancel(kind)) return null;
  if (kind === "working-tree") return { kind };
  const revision = await text({
    message: kind === "commit" ? "Which commit?" : "Which range?",
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

export const main = async (args = process.argv.slice(2)) => {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!args.length && interactive) {
    const command = await select({
      message: "What would you like to do?",
      options: [
        { value: "login", label: "Sign in" },
        { value: "connect", label: "Connect this CLI to the website" },
        { value: "status", label: "Check account status" },
        { value: "inspect", label: "Inspect local changes" },
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
      outro("Run senslop connect to keep your account connected.");
    return;
  }
  if (command === "connect") {
    await connect();
    outro("CLI disconnected.");
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
      outro("Run senslop connect to maintain website presence.");
    } catch (error) {
      progress.error("Could not verify the account.");
      throw error;
    }
    return;
  }
  const hasSource =
    values.commit !== undefined ||
    values.range !== undefined ||
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
  if (values.json) console.log(JSON.stringify(snapshot, null, 2));
  else {
    log.info(
      `Frozen ${snapshot.source.kind} snapshot: ${snapshot.files.length} changed files; ${snapshot.eligibility.qualifyingFiles}/5 qualifying text files.`,
    );
    if (snapshot.source.firstParent)
      log.info("Merge commit: reviewing its first-parent delta.");
    for (const file of snapshot.files)
      log.info(
        `${JSON.stringify(file.path)}: ${file.binary ? "binary metadata only" : `+${file.added} -${file.deleted}`}`,
      );
    for (const excluded of snapshot.excluded)
      log.warn(`Excluded ${JSON.stringify(excluded.path)}: ${excluded.reason}`);
    outro(
      snapshot.eligibility.eligible
        ? "Eligible for review. No upload performed."
        : "Ineligible: at least five text files must each have ten added+deleted lines. No upload performed.",
    );
  }
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
