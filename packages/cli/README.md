# Senslop CLI

Requires Node.js 24 or 26+ and Git. Senslop bundles the local browser app and its job engine. Local reviews do not require a hosted Senslop account.

This reference describes the implementation reconciled on October 24, 2026 at baseline 0860767. The package remains private and unpublished. In a source checkout, build through the workspace task graph and substitute `node packages/cli/dist/index.js` for `senslop`; see the [root setup guide](../../README.md). The [technical spec](../../devpost/spec.md) describes the current architecture, while the [roadmap](../../devpost/local-review-roadmap.md) contains proposed features.

## Run the app and CLI separately

Run the app in one terminal, from the repository you want to review:

```sh
senslop app start
```

This terminal owns the app and background jobs. Ctrl+C or `senslop app stop` stops both and retains saved data. Browser closure and completion of ordinary CLI commands leave the app running. `connect` remains an alias for `app start`.

Use a second terminal for commands or run `senslop` for the focused interactive menu:

```sh
senslop app status
senslop reviews list
senslop reviews create --working-tree --group --open --wait --json
```

Commands discover the running app for the canonical repository root, authenticate over loopback, perform their operation, and return to the shell. Use `--repo /absolute/path` from another directory. Run one app per repository; separate repositories can have separate app terminals. A missing or stale session gives an actionable `app start` error. Runtime capability records remain private and are removed on normal shutdown.

`app open` opens the browser without creating a review. `app start --no-open` runs without launching a browser. Agent output contains a safe review-specific browser URL; session capabilities are passed privately to the browser launcher.

## Multiple terminals and review identity

Only one app owns a resolved repository in a given application-data namespace. Repeated `app start` calls reuse its authenticated session and return its location. Simultaneous launches elect one owner; stale cleanup cannot release a replacement. An unrelated occupied saved port receives a new available port. Separate repositories retain their own app/engine processes.

`reviews create` saves and prepares without changing existing readers. The first saved review opens automatically; `--open` explicitly opens any new review in a dedicated browser tab. Browser history Open affects only that tab. Each tab retains its own review and selected file. Completion notifications are deferred.

Creation returns `id`, `hash`, `round`, `jobIds`, a safe review-specific `url`, the saved `review`, and `preparation` jobs. Omitting `--wait` returns after capture and scheduling, including when `--run-review` is requested. The owner must remain running for execution. Pending work resumes after restart. History shows snapshot readability separately from grouping and optional correctness status, with cancellation, retry, and queued priority controls.

Use explicit returned IDs in follow-up commands. `current` remains a shared convenience and may change between commands. Use `--expected-hash HASH --expected-round ROUND` to require the captured revision for a read or mutation; stale expectations fail with conflict feedback. Keep-mode re-sync retains the review ID and advances its round/hash. CLI run IDs identify saved AI jobs, distinct from internal worker execution IDs.

Model calls share endpoint concurrency and rolling request/token budgets across repository processes using the same application-data directory. Settings → AI also provides a total request ceiling, default four. Separate data directories are separate capacity namespaces, and calls outside Senslop remain untracked. Nested context requests reuse their parent's execution slot while consuming their own request/token allowance.

## Prepare and inspect reviews

Choose exactly one Git source for `reviews create`:

```sh
senslop reviews create --working-tree --open
senslop reviews create --commit HEAD --open
senslop reviews create --range HEAD~3..HEAD --open
senslop reviews create --branch feature --base main --open
```

`--group` and `--no-group` override the saved grouping default. Explicit grouping requires a configured model and fails before saving if unavailable. With no grouping model, `--no-group --open` still provides ordinary code review. `--wait` waits for the matching grouping job; `--run-review` additionally requests AI correctness analysis. Background jobs use captured model settings and immutable source. They continue while the app terminal runs and recover unfinished work after restart.

`inspect` attaches to the running app and creates a review. Its existing `inspect --working-tree --json` mode remains a standalone frozen-snapshot export: it starts no app, saves no review, opens no browser, and requires an explicit source. Use `reviews create --json` for saved-review automation. Standalone inspection retains its eligibility information and exit code 2 for ineligible selections; ordinary saved reviews accept small changes.

Use `reviews show ID`, `reviews files ID`, `reviews diff ID --file PATH`, and `reviews diff ID --file PATH --side before` to read frozen data. Reads leave browser selection unchanged. `reviews open ID` opens a dedicated browser tab. `reviews select ID PATH` saves a file selection; add `--open` to open that file in a dedicated tab. Use `current` instead of a snapshot ID to target the active review.

`reviews list` supports `--search`, `--offset`, and `--limit`. `reviews rename`, `reviews delete`, and `reviews export` manage saved snapshots. Export includes notes, progress, grouping, and AI runs. File completion uses explicit, repeatable `reviews complete ID PATH` and `reviews incomplete ID PATH` commands.

History search matches names and recorded folder paths. Browser history groups by full folder path, current app folder first, and retains newest-first order within a group. Legacy reviews without metadata show “Folder not recorded.” New captures retain the submitting terminal's effective folder, including an explicit `--repo` path. The app validates that this folder belongs to its resolved Git workspace. Browser captures use the app folder. Keep-mode re-sync preserves the review's original folder.

## Sync and analyze

```sh
senslop reviews sync current --mode keep --group --wait --json
senslop reviews sync current --mode new --no-group --json
senslop groups run current --wait --json
senslop reviews run current --wait --json
senslop runs list --review current --json
```

`keep` updates the specified review, retains notes and AI history, and preserves completion for unchanged files. `new` creates a separate newer-edits review, retaining the previous review in history. Sync applies to the specified working-tree review on the same branch and HEAD, independently of global selection. A branch/HEAD change requires a new review. Old AI results remain associated with their captured round.

`groups show` reads current grouping, summaries, rationale, relationships, and order. `groups run` explicitly enables grouping for the snapshot and starts or reruns it. `runs show`, `runs watch`, `runs cancel`, and `runs retry` work with grouping and correctness jobs. Retry creates a new attempt linked by `retryOf`, retaining the original revision, settings, and priority; stale revisions require a fresh analysis. `runs list --all` lists pending workspace jobs. `runs prioritize RUN_ID --priority high` gives queued work a bounded two-minute preference, without interrupting running work. `--priority normal|high` also applies when creating or starting analysis. `runs rename` and `runs delete` manage saved correctness reviews. `runs export RUN_ID` prints combined fix guidance; `--finding N` selects one issue, and `--json` returns structured results. These commands generate instructions and never apply code changes.

`--timeout SECONDS` bounds waits; default analysis timeout is 600 seconds. A timeout retains the saved job so an agent can reconnect with `runs watch`. Failed or canceled analysis returns an unsuccessful exit status; it is distinct from a completed review with no findings. AI requests may send captured code to the chosen provider and incur that provider's charges. Source access remains read-only.

## Notes and settings

```sh
senslop notes add current src/example.ts --body 'Check this behavior'
senslop notes add current src/example.ts --side after --start 12 --end 14 --body-file comment.txt
senslop notes list current --json
senslop settings show --section ai --json
senslop settings set groupingMode always
senslop settings set autoAdvance true --section review
senslop settings set view unified --section ui
senslop settings set prompt --value-file grouping-instructions.txt
```

Notes can be listed, edited, deleted, and filtered by file or text. Line comments use exact frozen source and validated coordinates. `--body-file -` reads stdin.

Settings support `ai`, `review`, and `ui` sections. `settings set KEY VALUE` patches a dotted key; JSON values can represent booleans, numbers, null, models, or nested objects. `--file PATH` accepts a JSON object patch; `--value-file PATH` reads a string. Both accept `-` for stdin. Unrelated values are preserved. AI settings include a shared model or separate Grouping, Context, Review, and Explain assignments. Read `providers models CONNECTION_ID` to obtain exact model identifiers.

CLI writes automatically refresh the open browser's reviews, analysis, notes, completion, providers, and settings. Unsaved AI instruction drafts are preserved when settings refresh. Existing keyboard shortcuts remain available in the browser.

Browser shortcuts include K for file search, D for completion, arrows for file navigation, and optional R/brackets for saved-review history. Typing and overlays retain their keys. Settings include Appearance, Review Preferences, Editor, AI, and Providers, with editor previews and configurable buddy behavior.

## Providers and credentials

`providers list`, `providers save`, `providers default`, `providers test`, `providers models`, `providers delete`, and `providers cleanup` use the same services as the UI. For example:

```sh
senslop providers save --provider ollama
senslop providers save --provider llama-cpp --endpoint http://localhost:8080/v1
senslop providers models CONNECTION_ID --json
senslop providers save --provider chatgpt --key-stdin < private-key.txt
```

Interactive API keys use hidden prompts. Automation uses stdin or a connection JSON input through `--file`; keys are never returned. Saves perform a metadata check and preserve the saved connection if that check fails. `--id` updates a connection; endpoint changes with saved credentials require a replacement key or explicit removal.

Subscription connections use `providers sign-in chatgpt-subscription` or `providers sign-in claude-code`; `--open --wait` opens their browser approval flow and waits for it. Sign-in status and cancellation are available through their scoped commands. `providers sign-out` disconnects an existing subscription. Hosted Senslop `login`, `status`, and `logout` remain separate from provider connections and local review; hosted login/logout use human-readable feedback rather than JSON.

Secrets use macOS Keychain, Windows Credential Manager, or Linux Secret Service through the existing credential abstraction. An unavailable or locked store blocks saving; there is no plaintext fallback. Linux requires a session D-Bus and an unlocked Secret Service. Nonsecret preferences and reviews live in the OS application-data directory, outside repositories. `SENSLOP_DATA_DIRECTORY` can select an isolated data directory for testing; use the same absolute path in both app and command terminals.

## Agent skill and help

```sh
senslop skills
senslop skills install --agent agents --scope project
senslop skills install --agent claude --scope project
senslop skills install --agent agents --scope user
senslop skills install --agent claude --scope user
senslop skills install --all
senslop skills install --all --symlink --json
senslop skills install --all --no-symlink --json
senslop help --json
senslop reviews create --help
```

The CLI archive includes the same `senslop-review` skill for Claude and all other agents. It teaches agents to select changes, discover the app, prepare and open a review, verify readiness, and sync later edits. `--agent agents`, labeled "all other agents", writes `.agents/skills/senslop-review/SKILL.md` for agents using that convention, including Codex. `--agent claude` writes `.claude/skills/senslop-review/SKILL.md`. Use `--all` to install for both targets and go directly to the symlink question. `--agent` accepts only `agents` or `claude` and installs only that target. `--scope user` uses the corresponding directory in the user's home instead of the repository root. Installation is explicit, idempotent, and refuses to overwrite a different existing skill. It does not modify AGENTS.md, CLAUDE.md, or unrelated skills.

Running `senslop skills` or `senslop skills install` without target flags opens a Clack multiselect. Use Space to toggle Claude and all other agents, then Enter to confirm. No options are preselected; submitting an empty selection installs both by default. Canceling exits without writing files. Automated commands require an explicit `--agent` or `--all`.

When both targets are selected, an interactive terminal asks whether to share one file through a symlink. Yes creates a relative link from `.claude/skills/senslop-review/SKILL.md` to the real file in `.agents/skills/senslop-review/SKILL.md`; no creates two independent files. Automation must choose `--symlink` or `--no-symlink` explicitly. Matching bundled copies can switch between these modes; custom skills and unrelated or broken symlinks are preserved. If the operating system cannot create a symlink, retry with `--no-symlink`.

Help and accepted options share one command catalog. Every command supports scoped `--help`; `help --json` exposes command/option descriptions, provider IDs, and exit codes. Use the installed help as the authoritative command reference.

Machine-oriented commands write undecorated JSON to stdout and structured errors to stderr. Noninteractive commands never wait for prompts. Deletion and provider sign-out require `--yes` outside an interactive terminal. Exit codes are 0 for success, 1 for operation failure, 2 for invalid usage or standalone snapshot ineligibility, 3 for an unavailable app, 4 for failed/canceled analysis, 5 for a wait timeout, and 6 for a retained review-revision conflict.

## Development and verification

Run `pnpm dev:local` in the repository to start the source app and worker. Use `node --import tsx packages/cli/src/index.ts COMMAND` from another terminal for source CLI commands, or pass `--repo PATH`. UI edits use Fast Refresh; CLI calls load current source on each invocation. Restart the app terminal after changing launcher logic. Installed users run the bundled production app.

Build the local app before the CLI with the package build commands. The archive includes standalone Next.js, shared assets, native runtime dependencies, and the skill; it excludes source workspaces and real environment files. The package remains private and is not published.

For the checkout, `pnpm exec turbo run build --filter=@senslop/cli` builds through the dependency graph. Root `pnpm typecheck`/`pnpm build` also include hosted workspaces and their environment requirements; targeted local checks do not require hosted authentication setup. Verify fresh archive installation separately before claiming distribution readiness.

Run the ordinary suite with `pnpm test`. `SENSLOP_AGENT_TEST=1 pnpm exec vitest run packages/cli/tests/agent-workflow.test.ts` exercises the production bundle and real local engine through independent CLI processes, using an isolated repository/data directory and deterministic loopback provider. This checks orchestration rather than real model quality. Existing opt-in development, installed-package, subscription, and OS credential tests remain available in their test files.
