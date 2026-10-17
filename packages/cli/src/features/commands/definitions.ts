import type { CommandDefinition } from "./types.js";

export const optionDefinitions: Record<
  string,
  { type: "string" | "boolean"; description: string; short?: string }
> = {
  help: {
    type: "boolean",
    short: "h",
    description: "Show help for this command.",
  },
  version: { type: "boolean", description: "Print the installed version." },
  json: {
    type: "boolean",
    description:
      "Print only JSON to stdout; errors are structured JSON on stderr.",
  },
  repo: {
    type: "string",
    description: "Repository path; defaults to the current directory.",
  },
  timeout: {
    type: "string",
    description: "Maximum wait in seconds, 1–3600; default 600.",
  },
  dev: {
    type: "boolean",
    description: "Start the source checkout's development app.",
  },
  open: {
    type: "boolean",
    description: "Open the browser and activate this review.",
  },
  "no-open": {
    type: "boolean",
    description: "Start the app without opening the browser.",
  },
  commit: {
    type: "string",
    description: "Inspect one commit's first-parent delta.",
  },
  range: {
    type: "string",
    description: "Inspect endpoint changes BASE..HEAD.",
  },
  branch: {
    type: "string",
    description: "Compare a local branch with HEAD or --base.",
  },
  base: { type: "string", description: "Base for --branch; default HEAD." },
  "working-tree": {
    type: "boolean",
    description: "Capture staged, unstaged, and untracked text.",
  },
  group: {
    type: "boolean",
    description:
      "Require grouping, overriding the saved default; requires a configured grouping model.",
  },
  "no-group": {
    type: "boolean",
    description: "Skip grouping, overriding the saved default.",
  },
  wait: {
    type: "boolean",
    description: "Wait for preparation or analysis to complete.",
  },
  "run-review": {
    type: "boolean",
    description: "Also run an AI correctness review.",
  },
  search: { type: "string", description: "Filter names or content." },
  offset: { type: "string", description: "Page offset; default 0." },
  limit: { type: "string", description: "Page size, 1–100; default 50." },
  file: {
    type: "string",
    description:
      "Repository-relative file path, or a JSON input path where documented; - reads stdin.",
  },
  side: {
    type: "string",
    description: "Frozen file content: before or after; omit to read the diff.",
  },
  mode: {
    type: "string",
    description:
      "Sync mode: keep preserves the review, new creates a newer-edits review; default keep.",
  },
  title: { type: "string", description: "Name for the saved review." },
  yes: {
    type: "boolean",
    description: "Explicitly confirm deletion or sign-out.",
  },
  review: {
    type: "string",
    description: "Saved review ID, or current; defaults to current.",
  },
  body: {
    type: "string",
    description: "Note text; alternatively use --body-file.",
  },
  "body-file": {
    type: "string",
    description: "Read note text from this file, or - for stdin.",
  },
  start: {
    type: "string",
    description: "First 1-based line of a comment in the selected frozen side.",
  },
  end: {
    type: "string",
    description: "Last inclusive line; defaults to --start.",
  },
  section: {
    type: "string",
    description: "Settings section: ai, review, or ui; default ai.",
  },
  "value-file": {
    type: "string",
    description: "Read a string setting from a UTF-8 file, or - for stdin.",
  },
  provider: {
    type: "string",
    description: "Provider identifier; list supported IDs with help --json.",
  },
  endpoint: {
    type: "string",
    description: "Provider base URL; defaults to the provider preset.",
  },
  id: {
    type: "string",
    description: "Existing provider connection ID to update.",
  },
  "context-window": {
    type: "string",
    description: "Local model context-window override.",
  },
  "key-stdin": {
    type: "boolean",
    description:
      "Read a replacement API key from stdin; keys never appear in output.",
  },
  "remove-key": { type: "boolean", description: "Remove the saved API key." },
  finding: {
    type: "string",
    description: "Export one finding's fix prompt by its 1-based index.",
  },
  agent: {
    type: "string",
    description:
      "Install only agents (all other agents, .agents) or claude (Claude, .claude). Omit to select interactively, or use --all.",
  },
  all: {
    type: "boolean",
    description:
      "Install for all targets, including Claude; skip target selection and ask about a symlink.",
  },
  symlink: {
    type: "boolean",
    description:
      "When installing both targets, link Claude's SKILL.md to the shared .agents skill without prompting.",
  },
  "no-symlink": {
    type: "boolean",
    description:
      "When installing both targets, install two independent skill files without prompting.",
  },
  scope: {
    type: "string",
    description: "Skill installation scope: project or user; default project.",
  },
  url: {
    type: "string",
    description: "Hosted Senslop origin for account sign-in.",
  },
};

export const sourceOptions = [
  "commit",
  "range",
  "branch",
  "base",
  "working-tree",
];
export const preparationOptions = [
  "group",
  "no-group",
  "wait",
  "open",
  "run-review",
  "timeout",
];
export const globalOptions = ["repo", "json", "help", "version"];

const skillInstallationOptions = [
  "agent",
  "all",
  "scope",
  "symlink",
  "no-symlink",
];

export const commandDefinitions: CommandDefinition[] = [
  {
    name: "app start",
    description:
      "Run the local app and worker in this terminal. Issue commands from another terminal.",
    options: ["dev", "no-open"],
  },
  {
    name: "app status",
    description: "Check the running app for this repository.",
    options: [],
  },
  {
    name: "app open",
    description: "Open the running workspace in your browser.",
    options: [],
  },
  {
    name: "app stop",
    description:
      "Gracefully stop the running app and worker; retain saved data.",
    options: ["timeout"],
  },
  {
    name: "reviews list",
    description: "List repository-scoped saved reviews, newest first.",
    options: ["search", "offset", "limit"],
  },
  {
    name: "reviews show",
    description:
      "Read a complete saved snapshot without changing UI selection. Use current for the active review.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "reviews files",
    description: "List changed files and completion state.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "reviews diff",
    description:
      "Read frozen diffs or --side before/after content, optionally for --file PATH.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["file", "side"],
  },
  {
    name: "reviews create",
    description:
      "Capture and activate a saved review. Choose exactly one Git source. Use --group --open --wait for an agent-to-human handoff.",
    options: [...sourceOptions, ...preparationOptions, "title"],
  },
  {
    name: "reviews open",
    description:
      "Activate a saved review in all open browser tabs; --open also launches the browser.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["open"],
  },
  {
    name: "reviews rename",
    description: "Rename a saved review.",
    arguments: "ID TITLE",
    minArgs: 2,
    maxArgs: 2,
    options: [],
  },
  {
    name: "reviews delete",
    description:
      "Delete a snapshot and its notes, progress, and AI history. Requires --yes outside an interactive terminal.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["yes"],
  },
  {
    name: "reviews sync",
    description:
      "Sync the current working-tree review on the same branch and HEAD. keep retains notes/history and unchanged-file completion; new creates a newer-edits review.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["mode", ...preparationOptions],
  },
  {
    name: "reviews select",
    description: "Activate this saved review and select a file in the browser.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: [],
  },
  {
    name: "reviews complete",
    description: "Explicitly mark a file complete; safe to repeat.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: [],
  },
  {
    name: "reviews incomplete",
    description: "Explicitly mark a file incomplete; safe to repeat.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: [],
  },
  {
    name: "reviews export",
    description:
      "Export saved review metadata, files, notes, progress, grouping, and AI runs.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "reviews run",
    description:
      "Run a correctness review using saved models. Working-tree snapshots must be fresh.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["wait", "timeout"],
  },
  {
    name: "groups show",
    description:
      "Read current grouping, rationale, summaries, relationships, and reading order.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "groups run",
    description:
      "Enable grouping for this snapshot and start or rerun it with saved models.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["wait", "timeout"],
  },
  {
    name: "runs list",
    description:
      "List grouping and correctness runs for --review ID, including older sync rounds.",
    options: ["review", "search", "offset", "limit"],
  },
  {
    name: "runs show",
    description:
      "Read an AI run with status, results, evidence, and limitations.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "runs watch",
    description:
      "Wait for a run to complete; a failed or canceled run exits unsuccessfully.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["timeout"],
  },
  {
    name: "runs cancel",
    description: "Cancel a queued or running grouping/review job.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "runs retry",
    description:
      "Start another run of the same task against the saved snapshot's current round.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["wait", "timeout"],
  },
  {
    name: "runs rename",
    description: "Rename a saved correctness-review run.",
    arguments: "RUN_ID TITLE",
    minArgs: 2,
    maxArgs: 2,
    options: [],
  },
  {
    name: "runs delete",
    description:
      "Delete a finished correctness-review run; requires confirmation.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["yes"],
  },
  {
    name: "runs export",
    description:
      "Print combined fix instructions, or --finding N for one finding. --json includes all result data.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["finding"],
  },
  {
    name: "notes list",
    description: "Read saved notes; optionally filter by --file or --search.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["file", "search"],
  },
  {
    name: "notes add",
    description:
      "Add a file note, or a frozen-source comment with --side and --start.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: ["body", "body-file", "side", "start", "end"],
  },
  {
    name: "notes edit",
    description: "Replace a note's text.",
    arguments: "ID NOTE_ID",
    minArgs: 2,
    maxArgs: 2,
    options: ["body", "body-file"],
  },
  {
    name: "notes delete",
    description: "Delete a saved note; requires confirmation.",
    arguments: "ID NOTE_ID",
    minArgs: 2,
    maxArgs: 2,
    options: ["yes"],
  },
  {
    name: "settings show",
    description: "Read saved settings for --section ai, review, or ui.",
    options: ["section"],
  },
  {
    name: "settings set",
    description:
      "Patch one dotted KEY using a JSON scalar/object or text VALUE. Alternatively --file reads a JSON object patch; --value-file reads a string. Preserves unrelated settings.",
    arguments: "[KEY] [VALUE]",
    maxArgs: 2,
    options: ["section", "file", "value-file"],
  },
  {
    name: "providers list",
    description: "List configured connections and defaults, without secrets.",
    options: [],
  },
  {
    name: "providers save",
    description:
      "Create/update a connection using flags or --file JSON. Interactive API keys use a hidden prompt; automation uses --key-stdin.",
    options: [
      "file",
      "provider",
      "endpoint",
      "id",
      "context-window",
      "key-stdin",
      "remove-key",
    ],
  },
  {
    name: "providers delete",
    description:
      "Remove a provider connection and its credential; requires confirmation.",
    arguments: "CONNECTION_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["yes"],
  },
  {
    name: "providers default",
    description: "Choose a default connection, or none to clear it.",
    arguments: "CONNECTION_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "providers test",
    description: "Check a saved connection using metadata only.",
    arguments: "CONNECTION_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "providers models",
    description: "Discover exact model identifiers for a saved connection.",
    arguments: "CONNECTION_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "providers sign-in",
    description:
      "Connect an existing chatgpt-subscription or claude-code subscription. Returns a sign-in request; --wait waits for browser approval.",
    arguments: "PROVIDER",
    minArgs: 1,
    maxArgs: 1,
    options: ["open", "wait", "timeout"],
  },
  {
    name: "providers sign-in-status",
    description: "Read the state of a subscription sign-in request.",
    arguments: "REQUEST_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "providers cancel-sign-in",
    description: "Cancel a pending subscription sign-in request.",
    arguments: "REQUEST_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "providers sign-out",
    description:
      "Disconnect a saved subscription connection; requires confirmation.",
    arguments: "CONNECTION_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["yes"],
  },
  {
    name: "providers cleanup",
    description: "Retry pending OS credential cleanup.",
    options: [],
  },
  {
    name: "skills",
    description:
      "Install review skills. Space selects targets and Enter confirms; selecting none installs both. --agent selects one; --all skips to the symlink question.",
    options: skillInstallationOptions,
  },
  {
    name: "skills install",
    description:
      "Alias for skills. Select targets interactively, use --agent for one target, or --all for both. Installing both asks about a symlink.",
    options: skillInstallationOptions,
  },
  {
    name: "help",
    description:
      "Show help; --json returns the complete command/option catalog and provider IDs.",
    arguments: "[COMMAND] [SUBCOMMAND]",
    maxArgs: 2,
    options: [],
  },
  {
    name: "inspect",
    description:
      "Create a review in the running app. --json preserves the standalone frozen snapshot export and starts no app.",
    options: [...sourceOptions, ...preparationOptions],
  },
  {
    name: "connect",
    description: "Alias for app start. Run commands from a separate terminal.",
    options: ["dev", "no-open"],
  },
  {
    name: "login",
    description:
      "Connect a hosted Senslop account; independent of local reviews.",
    options: ["url"],
  },
  {
    name: "status",
    description:
      "Check the saved hosted account credential. Use app status for the local app.",
    options: [],
  },
  {
    name: "logout",
    description: "Revoke the hosted Senslop account credential.",
    options: [],
  },
];
