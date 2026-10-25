import type { CommandDefinition } from "./types.js";

export const optionDefinitions: Record<
  string,
  { type: "string" | "boolean"; description: string; short?: string }
> = {
  live: {
    type: "boolean",
    description:
      "Opt into live synthetic-corpus inference; may incur provider charges.",
  },
  "organization-version": {
    type: "string",
    description: "Require the saved organization version before editing.",
  },
  "brief-version": {
    type: "string",
    description: "Require the saved brief version before editing.",
  },
  status: {
    type: "string",
    description: "Finding decision: open, accepted, dismissed, or resolved.",
  },
  reason: {
    type: "string",
    description: "Optional decision reason or failure details.",
  },
  findings: {
    type: "string",
    description: "Comma-separated persistent finding IDs.",
  },
  notes: {
    type: "string",
    description: "Comma-separated human note IDs to include.",
  },
  constraints: {
    type: "string",
    description: "Constraints for the selected fix task.",
  },
  "suggested-checks": {
    type: "string",
    description: "Comma-separated suggested commands; these are not executed.",
  },
  workspace: {
    type: "string",
    description: "Fix target: managed or current; default managed.",
  },
  "agent-name": {
    type: "string",
    description: "Name recorded when claiming a fix task.",
  },
  paths: {
    type: "string",
    description: "Comma-separated returned task paths to apply.",
  },
  command: {
    type: "string",
    description: "Exact local check command to execute.",
  },
  cwd: {
    type: "string",
    description: "Command directory relative to the managed source root.",
  },
  "reuse-check": {
    type: "string",
    description:
      "Reuse an exact-round check workspace and prepared dependencies.",
  },
  round: { type: "string", description: "Captured review round to inspect." },
  target: {
    type: "string",
    description:
      "Primary finding ID for duplicate linkage; omit to keep separate.",
  },
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
  "expected-hash": {
    type: "string",
    description:
      "Require the captured review content hash; use with --expected-round.",
  },
  "expected-round": {
    type: "string",
    description: "Require the captured review round; use with --expected-hash.",
  },
  priority: {
    type: "string",
    description:
      "Queue priority: normal or high; high gives a bounded preference without interrupting running work.",
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
    description:
      "Frozen source side: before or after. Source commands default to after; reviews diff without --side returns the diff.",
  },
  mode: {
    type: "string",
    description:
      "Sync mode: keep preserves the review, new creates a newer-edits review; default keep.",
  },
  title: { type: "string", description: "Name for the saved review." },
  yes: {
    type: "boolean",
    description: "Explicitly confirm the requested operation.",
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
  "compare-base": {
    type: "boolean",
    description: "Also run this command against the captured base.",
  },
  outcome: {
    type: "string",
    description: "present, apparently-fixed, not-applicable, or unverified.",
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
    description:
      "Skill scope: project or user. Rules scope: project or review; default review.",
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
  "priority",
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
    name: "regions list",
    description: "Read exact changed regions, ownership, flows and completion.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "regions update",
    description:
      "Apply an organization action from --file JSON. Reset requires --yes in automation.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: [
      "file",
      "organization-version",
      "expected-hash",
      "expected-round",
      "yes",
    ],
  },
  {
    name: "brief show",
    description:
      "Read versioned intent, captured documents and effective rules.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "brief set",
    description:
      "Save a review brief from --file JSON. Document paths resolve to captured source.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["file", "brief-version", "expected-hash", "expected-round"],
  },
  {
    name: "rules show",
    description:
      "Inspect effective profiles, rule sources and local overrides.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "rules set",
    description:
      "Replace local project or review overrides from --file JSON; {} restores inheritance.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["file", "scope", "expected-hash", "expected-round"],
  },
  {
    name: "source index",
    description:
      "Read frozen files, symbols, relationships, capabilities and impact.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["side", "expected-hash", "expected-round"],
  },
  {
    name: "source show",
    description: "Read exact frozen source, never live disk.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: ["side", "expected-hash", "expected-round"],
  },
  {
    name: "source search",
    description: "Search frozen source content with --search.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["side", "search", "expected-hash", "expected-round"],
  },
  {
    name: "quality list",
    description: "Read the last 20 saved project quality reports.",
    options: [],
  },
  {
    name: "quality show",
    description: "Read an inspectable quality report for export or comparison.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: [],
  },
  {
    name: "quality run",
    description:
      "Run deterministic contracts, or --live for opt-in Review model inference. Live automation requires --yes.",
    options: ["live", "yes"],
  },
  ...[
    {
      name: "findings verify",
      description:
        "Assess selected findings against this exact source revision.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: ["findings", "expected-hash", "expected-round"],
    },
    {
      name: "findings assess",
      description: "Record a manual assessment; --reason is optional.",
      arguments: "REVIEW FINDING",
      minArgs: 2,
      maxArgs: 2,
      options: ["outcome", "reason", "expected-hash", "expected-round"],
    },
    {
      name: "verifications list",
      description: "List persisted verification runs.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: [],
    },
    {
      name: "verifications cancel",
      description: "Cancel a verification run.",
      arguments: "REVIEW VERIFICATION",
      minArgs: 2,
      maxArgs: 2,
      options: ["expected-hash", "expected-round"],
    },
    {
      name: "findings list",
      description:
        "List durable finding identities, observations and decisions.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: ["status"],
    },
    {
      name: "findings decide",
      description: "Save a finding decision; --reason is optional.",
      arguments: "REVIEW FINDING",
      minArgs: 2,
      maxArgs: 2,
      options: ["status", "reason", "expected-hash", "expected-round"],
    },
    {
      name: "findings link",
      description:
        "Link a duplicate to --target, or keep an ambiguous issue separate.",
      arguments: "REVIEW FINDING",
      minArgs: 2,
      maxArgs: 2,
      options: ["target", "expected-hash", "expected-round"],
    },
    {
      name: "tasks list",
      description: "List tracked fix tasks for a review.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: [],
    },
    {
      name: "tasks create",
      description: "Create a persistent selected-finding agent handoff.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: [
        "findings",
        "notes",
        "title",
        "constraints",
        "suggested-checks",
        "workspace",
        "expected-hash",
        "expected-round",
      ],
    },
    ...[
      "show",
      "export",
      "claim",
      "return",
      "cancel",
      "fail",
      "reviewed",
      "apply",
    ].map((operation) => ({
      name: `tasks ${operation}`,
      description: `${operation} a tracked fix task using its captured source identity.`,
      arguments: "TASK",
      minArgs: 1,
      maxArgs: 1,
      options: [
        "agent-name",
        "reason",
        "paths",
        "yes",
        "expected-hash",
        "expected-round",
      ],
    })),
    {
      name: "checks list",
      description: "List revision-bound project checks.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: [],
    },
    {
      name: "checks run",
      description:
        "Run an explicitly selected command in a managed source workspace.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: [
        "command",
        "cwd",
        "findings",
        "timeout",
        "reuse-check",
        "compare-base",
        "expected-hash",
        "expected-round",
      ],
    },
    ...["show", "watch", "cancel"].map((operation) => ({
      name: `checks ${operation}`,
      description: `${operation} a saved check run.`,
      arguments: "CHECK",
      minArgs: 1,
      maxArgs: 1,
      options: ["timeout", "expected-hash", "expected-round"],
    })),
    ...["list", "show"].map((operation) => ({
      name: `rounds ${operation}`,
      description: `${operation} immutable captured review rounds.`,
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: ["round"],
    })),
    {
      name: "usage show",
      description: "Read measured usage and unknown cost records for a review.",
      arguments: "REVIEW",
      minArgs: 1,
      maxArgs: 1,
      options: [],
    },
  ],
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
    options: ["expected-hash", "expected-round"],
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
      "Capture and prepare in the background. The first review opens automatically; --open explicitly opens another review. Choose exactly one Git source.",
    options: [...sourceOptions, ...preparationOptions, "title"],
  },
  {
    name: "reviews open",
    description:
      "Open a saved review in a dedicated browser tab without navigating other readers.",
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
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "reviews delete",
    description:
      "Delete a snapshot and its notes, progress, and AI history. Requires --yes outside an interactive terminal.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["yes", "expected-hash", "expected-round"],
  },
  {
    name: "reviews sync",
    description:
      "Sync the specified working-tree review on the same branch and HEAD without changing other readers. keep retains notes/history; new creates a newer-edits review.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["mode", ...preparationOptions, "expected-hash", "expected-round"],
  },
  {
    name: "reviews select",
    description:
      "Save a file selection for this review; --open opens a dedicated browser tab.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: ["expected-hash", "expected-round", "open"],
  },
  {
    name: "reviews complete",
    description: "Explicitly mark a file complete; safe to repeat.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "reviews incomplete",
    description: "Explicitly mark a file incomplete; safe to repeat.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "reviews export",
    description:
      "Export saved review metadata, files, notes, progress, grouping, and AI runs.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "reviews run",
    description:
      "Run a correctness review using saved models. Working-tree snapshots must be fresh.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["wait", "timeout", "expected-hash", "expected-round", "priority"],
  },
  {
    name: "groups show",
    description:
      "Read current grouping, rationale, summaries, relationships, and reading order.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["expected-hash", "expected-round"],
  },
  {
    name: "groups run",
    description:
      "Enable grouping for this snapshot and start or rerun it with saved models.",
    arguments: "ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["wait", "timeout", "expected-hash", "expected-round", "priority"],
  },
  {
    name: "runs list",
    description:
      "List grouping and correctness runs for --review ID, including older sync rounds.",
    options: ["review", "search", "offset", "limit", "all"],
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
      "Retry a failed or canceled job against its original revision and captured settings.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["wait", "timeout"],
  },
  {
    name: "runs prioritize",
    description: "Change a queued job to normal or high priority.",
    arguments: "RUN_ID",
    minArgs: 1,
    maxArgs: 1,
    options: ["priority"],
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
    options: ["file", "search", "expected-hash", "expected-round"],
  },
  {
    name: "notes add",
    description:
      "Add a file note, or a frozen-source comment with --side and --start.",
    arguments: "ID PATH",
    minArgs: 2,
    maxArgs: 2,
    options: [
      "body",
      "body-file",
      "side",
      "start",
      "end",
      "expected-hash",
      "expected-round",
    ],
  },
  {
    name: "notes edit",
    description: "Replace a note's text.",
    arguments: "ID NOTE_ID",
    minArgs: 2,
    maxArgs: 2,
    options: ["body", "body-file", "expected-hash", "expected-round"],
  },
  {
    name: "notes delete",
    description: "Delete a saved note; requires confirmation.",
    arguments: "ID NOTE_ID",
    minArgs: 2,
    maxArgs: 2,
    options: ["yes", "expected-hash", "expected-round"],
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
      "Create/update a connection using flags or --file JSON. New OpenAI-compatible providers require --file with model definitions. Interactive API keys use a hidden prompt; automation uses --key-stdin.",
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
