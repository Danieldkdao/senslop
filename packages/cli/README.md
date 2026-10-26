# Senslop CLI

Requires Node.js 24.x or 26+ and Git; source builds use pnpm 12.8.1. Senslop bundles the local browser app and its job engine. Local reviews do not require a hosted Senslop account.

This reference describes the committed implementation at `738af5b`, reconciled October 26, 2026, including all approved delivery scopes and the UI/runtime follow-ups. The package remains private and unpublished. In a source checkout, build through the workspace task graph and substitute `node packages/cli/dist/index.js` for `senslop`; see the [root setup guide](../../README.md). The [technical spec](../../devpost/spec.md) describes the current architecture, while the [roadmap](../../devpost/local-review-roadmap.md) records delivered scopes, dated evidence, and remaining release work.

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

`reviews create` saves and prepares without changing existing readers. The first saved review opens automatically; `--open` explicitly opens any new review in a dedicated browser tab. Browser history Open affects only that tab. Each tab retains its own review and selected file. Desktop activity notifications are implemented with browser permission and category opt-in; they require a workspace tab and the owning app to remain running.

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

`--timeout SECONDS` bounds CLI waiting, which defaults to 600 seconds; it is separate from the model transport timeout. A wait timeout retains the saved job so an agent can reconnect with `runs watch RUN_ID --timeout 1200 --json`. ChatGPT subscription and Vercel Gateway structured analysis stream with a 15-minute per-call budget and an eight-minute first-content/inactivity allowance; buffered provider steps retain an eight-minute step limit within that budget, and cancellation aborts active work. A successful fixture transport test does not establish real model/account compatibility. Failed or canceled analysis returns an unsuccessful exit status; it is distinct from a completed review with no findings. AI requests may send captured code to the chosen provider and incur that provider's charges. AI review source tools remain read-only; task application and checks are separate explicit actions.

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

Browser shortcuts include K for file search, D for completion, arrows for region/file navigation, optional R/brackets for saved-review history, Mod+K for commands, F for focused reading, N for notes, and named toolbar shortcuts. Typing and overlays retain their keys. Searchable settings include About, AI/Providers, editor/appearance, Git, notifications, project memory, source/execution, usage, rules, language support, and review quality.

## Precision review

Use returned review IDs, hashes, rounds, region IDs, and versions for automation:

```sh
senslop regions list REVIEW --json
senslop regions update REVIEW --file action.json --organization-version 3 --json
senslop brief show REVIEW --json
senslop brief set REVIEW --file brief.json --brief-version 0 --json
senslop rules show REVIEW --json
senslop rules set REVIEW --scope review --file rules.json --json
senslop source index REVIEW --side before --json
senslop source show REVIEW src/example.ts --side before --json
senslop source search REVIEW --search handler --side after --json
senslop quality run --json
senslop quality list --json
senslop quality show RUN_ID --json
```

Region actions include `complete-unit`, `complete-file`, flow creation/rename/reorder, moving/splitting/combining units, combining flows, and `reset-organization`. Each changed line belongs to one unit once; file completion derives from all its units. Resetting manual organization requires confirmation. Existing `reviews complete`/`incomplete` commands update all units in that file. Add `--expected-hash HASH --expected-round ROUND` when continuing an automated task; conflicts require reassessment.

Brief JSON contains `request`, `documents` as captured text paths with `contents: ""`, optional HTTP/HTTPS `links`, and `criteria` with stable `id`, `text`, `sourceQuote`, and optional `checkIds`. The server reads attachments from captured source. Saving appends a version. Requirement results live on matching saved review runs; verified means source evidence plus explicitly linked passing exact-revision checks.

Rules JSON selects `profiles`, `rules` with stable IDs/text/path globs/enabled state, and optional custom profiles/instruction documents. Root/nested `.senslop/review.json` files must be included in captured Git source; ignored files need tracking or an explicit ignore exception. Only this explicit configuration path is allowed within the private state directory. Nested rules stay scoped; project overrides precede review overrides. `rules set ... --file` replaces the chosen override; `{}` restores inheritance. `rules show` exposes effective settings, source provenance, and limitations.

Source navigation/search always reads the saved before/after version. Python/Go have packaged parsing; semantic servers are optional local tools configured in Language support. Missing tools/dependencies retain honest limitations.

Default quality runs are deterministic synthetic contracts. `quality run --live --yes --json` explicitly sends the corpus plus saved grouping instructions to the selected Review model and may incur charges. Reports retain model/instructions and separate contract checks from live findings/grouping judgments. Unknown usage/cost remains unknown; no live-provider quality result is claimed by ordinary tests.

## Finish a review

```sh
senslop memory list --json
senslop memory apply --file guidance-action.json --json
senslop reports generate REVIEW --round 1 --json
senslop reports list REVIEW --json
senslop reports export REPORT --format html --output report.html
senslop git status --json
senslop git diff src/example.ts --staged --json
senslop git stage src/example.ts --expected-state IDENTITY --json
senslop git commit --subject "fix: preserve documented behavior" --yes --json
senslop git outgoing --remote origin --branch main --json
senslop git push --remote origin --branch main --yes --json
```

Project memory is explicit, scoped guidance with origin/version history; it never automatically dismisses findings. Report versions retain captured rounds, distinguish missing evidence, and export without source excerpts by default; `--include-source` includes only permitted frozen excerpts. Export refuses to overwrite existing files.

Git actions operate on live state independently of frozen reviews. Files/hunks can be staged or unstaged without rewriting working edits. Commits include the complete staged candidate, run configured hooks/signing, and stop if hooks change that candidate. Pull is fast-forward only with a clean tree; fetch/push use existing Git authentication. `git conflict PATH` reads base/local/incoming sides; `git abort-merge --yes` explicitly aborts a merge. No force push or history rewriting is provided.

The optional checkpoint defaults off. Configure it using `checkpoint configure --file policy.json`, install its terminal wrapper using `checkpoint install --yes`, and remove it using `checkpoint remove --yes`. The wrapper preserves an existing pre-push hook and checks exact outgoing refs/objects without the browser app. `checkpoint check` reports unreviewed versions, unresolved findings, and required missing/stale checks. `checkpoint override --reason TEXT` records a short-lived object-specific override; `git push --reason TEXT --yes` records the same explicit exception for an app-connected push.

`about` reports app/version diagnostics. `update check` reads release availability; `update` asks before installation, and JSON automation requires `--yes`. Ordinary interactive commands automatically offer Update now or Continue when a newer stable release exists. Global npm/pnpm installs use their matching manager after idle checks and a SQLite backup; source/archive copies use their original installation method. The package remains unpublished, so a real newer-release upgrade remains a release check.

Browser Settings includes About with nearby sanitized diagnostics and opt-in desktop notifications. All notification categories start off, permission must be granted before activation, and foreground alerts have their own opt-in. Test notification reports browser submission through toasts; OS banner visibility is separate, and delivery uses atomic server claims even when Web Locks is unavailable. App/CLI update notices remain automatic. Mod+K commands, focused reading, saved per-tab view state, and bounded 30-day note/chat/commit draft recovery support everyday work; shortcut customization is deferred beyond the first version. `/ai-test` is retired; provider checks remain metadata-only.

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

Run `pnpm dev:local` in the repository to start the source app and worker. Use `node --import tsx packages/cli/src/index.ts COMMAND` from another terminal for source CLI commands, or pass `--repo PATH`. UI edits use Fast Refresh; frozen compilation runs in a separate worker and CLI calls load current source on each invocation. To run development against another project, use `node --import tsx packages/cli/src/index.ts app start --dev --repo /absolute/path/to/project`; restart the app terminal after changing launcher logic, and stop it before switching between development and production for the same project. Installed users run the bundled production app.

From the checkout root, use the [root setup guide](../../README.md#try-it-locally): `pnpm install --frozen-lockfile`, then `pnpm exec turbo run build --filter=@senslop/cli`. For explicit rebuilds, run `pnpm --filter @senslop/local build` before `pnpm --filter @senslop/cli build`; the app build compiles the frozen-analysis worker before Next.js, and the CLI packages that standalone output. The archive includes standalone Next.js, shared assets, native runtime dependencies, and the skill; it excludes source workspaces and real environment files. The package remains private and is not published.

For the checkout, `pnpm exec turbo run build --filter=@senslop/cli` builds through the dependency graph. Root `pnpm typecheck`/`pnpm build` also include hosted workspaces and their environment requirements; targeted local checks do not require hosted authentication setup. Verify fresh archive installation separately before claiming distribution readiness.

Run the ordinary suite with `pnpm test`. `SENSLOP_AGENT_TEST=1 pnpm exec vitest run packages/cli/tests/agent-workflow.test.ts` exercises the production bundle and real local engine through independent CLI processes, using an isolated repository/data directory and deterministic loopback provider. This checks orchestration rather than real model quality. Existing opt-in development, installed-package, subscription, and OS credential tests remain available in their test files.

## Fix and verify

Findings retain stable IDs and original evidence across keep-mode rounds. Human decisions are `open`, `accepted`, `dismissed`, or `resolved`; model assessments and passing check evidence remain separate. Dismissal reasons and manual verification notes are optional.

```sh
senslop findings list REVIEW --json
senslop findings decide REVIEW FINDING --status accepted --json
senslop tasks create REVIEW --findings FINDING_IDS --workspace managed --json
senslop tasks export TASK
senslop tasks claim TASK --agent-name "My agent" --json
senslop tasks return TASK --json
senslop tasks apply TASK --paths src/example.ts --yes --json
senslop checks run REVIEW --command "pnpm test" --findings FINDING_IDS --compare-base --json
senslop checks watch CHECK --json
senslop findings verify REVIEW --findings FINDING_IDS --json
senslop verifications list REVIEW --json
senslop findings assess REVIEW FINDING --outcome apparently-fixed --json
senslop rounds show REVIEW --round 1 --json
senslop usage show REVIEW --json
```

Comma-separated finding/note/file IDs select a bounded handoff. Add `--expected-hash HASH --expected-round N` for revision-sensitive automation. A managed task reproduces staged, unstaged, and untracked reviewed bytes; no task applies changes automatically. Unchanged tracked assets stream independently of the 20 MiB review-snapshot aggregate limit, and unchanged large images are hashed before return-text capture; changed-file, mode, and source-policy restrictions still apply. Inspect returned edits in Work before applying. Returning file-mode changes, including executable-bit-only edits, reports that manual handling is required. Pass `--repo ORIGINAL_PROJECT` to CLI operations while editing a managed directory. The manual handoff works with external agents; stopping their independent processes remains the agent runner's responsibility.

Work uses full-width icon tabs with tooltips and stacked disclosures: verification has per-finding status/details, and check Output is the only inner disclosure open by default. Creating task/verification work selects its tab with feedback; applying returned edits has a loading state and progress/outcome toasts. Individual/bulk history removal hides finished rows while retaining linked evidence, and active rows must finish or be canceled first; it is distinct from data deletion.

Checks execute an explicitly chosen shell command with host permissions in a Senslop-owned worktree, with a bounded environment, recorded input/dependency hashes, output, duration, exit status, cancellation, and timeout. Worktrees share Git metadata and provide no OS sandbox. Dependency installation is an explicit check command; `--reuse-check CHECK` reuses its prepared workspace only for the same exact review revision. A command that changes captured source cannot become passing evidence. `checks watch` exits successfully only for a passed check; failed, blocked, canceled, timed-out, and interrupted results exit with code 4 and retain their check/review IDs in JSON error details. Base failures and missing tools remain distinct from changed-source regressions. The browser can also record and download explicitly selected generated artifacts; newer or expired artifact bytes are not served as the recorded artifact.

The project switcher discovers sibling Git worktrees and retains archived source when a folder disappears. Model assignments, review preferences, and source policy share the common Git project; reviews, reading positions, and execution tasks stay worktree-scoped. Provider credentials, machine capacity, and appearance remain shared. Source & execution settings control inclusion, local-only inference, command timeouts, and retention. Stricter policies block incompatible contexts and old conversation continuation while preserving local evidence. Data & privacy provides metadata/source exports, review-data deletion, and owned-workspace cleanup; About provides sanitized diagnostics.

Usage records include model requests, context calls, and retries. Per-review token/request-time allowances stop new work conservatively and concurrent requests share the remaining aggregate request time; Quick skips delegated context and Thorough permits it. The Usage settings section contains aggregate charts. Costs stay unknown when reliable pricing is unavailable and exclude independent external-agent usage. Completed batches remain available to a compatible retry.
