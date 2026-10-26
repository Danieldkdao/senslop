#!/usr/bin/env node
import { executeDailyCommand } from "./features/daily-workflow/commands.js";
import { executeCheckpointCommand } from "./features/daily-workflow/checkpoint-commands.js";
import {
  executeUpdateCommand,
  notifyCliUpdate,
} from "./features/updates/commands.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { select, text, isCancel } from "@clack/prompts";
import { simpleGit } from "simple-git";
import { secureBaseURL, type SourceSelectionSchema } from "@senslop/contracts";
import { runWorkspace } from "./features/workspace/run-workspace.js";
import { executeAppCommand } from "./features/workspace/app-commands.js";
import { connectWorkspace } from "./features/workspace/workspace-client.js";
import { collectSnapshot } from "./features/git/snapshot.js";
import { sourceFromOptions } from "./features/commands/source.js";
import { parseCliCommand } from "./features/commands/parse-command.js";
import { commandCatalog, formatCommandHelp } from "./features/commands/help.js";
import { formatCommandResult } from "./features/commands/formatters.js";
import { CliError } from "./features/commands/errors.js";
import { stringOption } from "./features/commands/input.js";
import { executeReviewCommand } from "./features/reviews/commands.js";
import { executeSettingsCommand } from "./features/settings/commands.js";
import { executeProviderCommand } from "./features/providers/commands.js";
import { executeSkillCommand } from "./features/skills/commands.js";
import { requireCredentials } from "./features/auth/credentials.js";
import { fetchStatus } from "./features/connection/fetch-status.js";
import { login } from "./features/auth/login.js";
import { logout } from "./features/auth/logout.js";

export { sourceFromOptions } from "./features/commands/source.js";
export const HELP = formatCommandHelp();
export const parseCommand = (args: string[]) => {
  const parsed = parseCliCommand(args);
  return { command: parsed.name, values: parsed.values };
};

const promptSource = async (
  signal?: AbortSignal,
  repository = process.cwd(),
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
    const branches = await simpleGit(repository).branchLocal();
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

export const main = async (args = process.argv.slice(2)) => {
  const interactive = !!(process.stdin.isTTY && process.stdout.isTTY);
  if (!args.length && interactive) {
    const name = await select({
      message: "What would you like to do?",
      options: [
        { value: "reviews create", label: "Prepare changes for review" },
        { value: "reviews list", label: "List saved reviews" },
        { value: "reviews sync current", label: "Sync the current review" },
        { value: "reviews run current", label: "Run an AI review" },
        { value: "settings show", label: "Show AI settings" },
        { value: "app open", label: "Open the browser workspace" },
        { value: "app status", label: "Check the running app" },
        { value: "help", label: "Show all commands" },
      ],
    });
    if (isCancel(name)) return;
    args = name.split(" ");
  }
  const command = parseCliCommand(args);
  const { name, values } = command;
  if (name === "version") {
    console.log(commandCatalog().version);
    return;
  }
  if (command.help || name === "help") {
    console.log(
      values.json
        ? JSON.stringify(commandCatalog(), null, 2)
        : formatCommandHelp(name === "help" ? command.args.join(" ") : name),
    );
    return;
  }
  const repository = stringOption(values, "repo") ?? process.cwd();
  if (name === "update" || name === "update check") {
    console.log(
      formatCommandResult(await executeUpdateCommand(command), !!values.json),
    );
    return;
  }
  if (name.startsWith("checkpoint ")) {
    console.log(
      formatCommandResult(
        await executeCheckpointCommand(command, repository),
        !!values.json,
      ),
    );
    return;
  }
  if (name === "app start" || name === "connect") {
    await runWorkspace({
      development: !!values.dev,
      repository,
      openBrowser: !values["no-open"],
      json: !!values.json,
    });
    return;
  }
  if (name === "login") {
    if (values.json)
      throw new CliError(
        "Account login uses human browser approval. Run without --json.",
        "invalid_arguments",
        2,
      );
    let url = stringOption(values, "url");
    if (!url && interactive) {
      const entered = await text({
        message: "What is your Senslop website URL?",
        validate: (value) => {
          try {
            secureBaseURL(value ?? "");
          } catch (error) {
            return (error as Error).message;
          }
        },
      });
      if (isCancel(entered)) return;
      url = entered;
    }
    if (!url)
      throw new CliError(
        "Use senslop login --url WEBSITE_URL.",
        "invalid_arguments",
        2,
      );
    await login(url);
    return;
  }
  if (name === "logout") {
    if (values.json)
      throw new CliError(
        "Account logout uses human-readable feedback. Run without --json.",
        "invalid_arguments",
        2,
      );
    await logout();
    return;
  }
  if (name === "status") {
    const result = await fetchStatus(await requireCredentials());
    if (!result)
      throw new CliError(
        "Account status unavailable. Check the service or sign in again.",
      );
    console.log(formatCommandResult(result, !!values.json));
    return;
  }
  if (name === "skills" || name === "skills install") {
    console.log(
      formatCommandResult(
        await executeSkillCommand(command, repository),
        !!values.json,
      ),
    );
    return;
  }
  if (
    (name === "inspect" || name === "reviews create") &&
    !["commit", "range", "branch", "working-tree"].some((key) => values[key])
  ) {
    if (!interactive || values.json)
      throw new CliError(
        "Choose exactly one of --commit, --range, --branch or --working-tree.",
        "invalid_arguments",
        2,
      );
    const source = await promptSource(undefined, repository);
    if (!source) return;
    switch (source.kind) {
      case "working-tree":
        values["working-tree"] = true;
        break;
      case "commit":
        values.commit = source.commit;
        break;
      case "range":
        values.range = `${source.base}..${source.head}`;
        break;
      case "branch":
        values.branch = source.branch;
        values.base = source.base;
        break;
    }
    values.open = true;
  }
  if (name === "inspect" && values.json) {
    if (
      ["group", "no-group", "open", "wait", "run-review", "timeout"].some(
        (key) => values[key],
      )
    )
      throw new CliError(
        "Standalone inspect --json only collects a snapshot. Use reviews create --json for saved reviews and preparation.",
        "invalid_arguments",
        2,
      );
    const snapshot = await collectSnapshot({
      cwd: repository,
      source: sourceFromOptions({
        commit: stringOption(values, "commit"),
        range: stringOption(values, "range"),
        branch: stringOption(values, "branch"),
        base: stringOption(values, "base"),
        "working-tree": !!values["working-tree"],
      }),
    });
    console.log(JSON.stringify(snapshot, null, 2));
    if (!snapshot.eligibility.eligible) process.exitCode = 2;
    return;
  }
  let result: unknown;
  if (name.startsWith("app "))
    result = await executeAppCommand(command, repository);
  else {
    const client = await connectWorkspace(repository).catch((error: Error) => {
      throw new CliError(error.message, "app_unavailable", 3);
    });
    if (name === "about" || /^(git|memory|reports) /.test(name))
      result = await executeDailyCommand(client, command);
    else if (name.startsWith("settings "))
      result = await executeSettingsCommand(client, command);
    else if (name.startsWith("providers "))
      result = await executeProviderCommand(client, command);
    else result = await executeReviewCommand(client, command);
  }
  console.log(formatCommandResult(result, !!values.json));
};

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  notifyCliUpdate(process.argv.slice(2))
    .then((updated) => (updated ? undefined : main()))
    .catch(
      (
        error: Error & { code?: string; exitCode?: number; details?: unknown },
      ) => {
        const json = process.argv.includes("--json");
        const code =
          error.exitCode ??
          (error instanceof TypeError ||
          /Unknown command|not valid|Usage:|Choose exactly|--group or|--timeout/.test(
            error.message,
          )
            ? 2
            : 1);
        process.stderr.write(
          json
            ? `${JSON.stringify({ error: { code: error.code ?? (code === 2 ? "invalid_arguments" : "operation_failed"), message: error.message, ...(error.details ? { details: error.details } : {}) } })}\n`
            : `Senslop: ${error.message}\n`,
        );
        process.exitCode = code;
      },
    );
}
