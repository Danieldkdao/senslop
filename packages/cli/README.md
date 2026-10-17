# Senslop CLI

Requires Node.js 24 or 26+ and Git. Senslop bundles the local browser app and its job engine. Local reviews do not require a hosted Senslop account.

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

`app open` opens the browser without creating a review. `app start --no-open` runs without launching a browser. Agent output contains a safe browser origin; session capabilities are passed privately to the browser launcher.

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

Use `reviews show ID`, `reviews files ID`, `reviews diff ID --file PATH`, and `reviews diff ID --file PATH --side before` to read frozen data. Reads leave browser selection unchanged. `reviews open ID` activates a saved snapshot; add `--open` to launch the browser. `reviews select ID PATH` selects a file. Use `current` instead of a snapshot ID to target the active review.

`reviews list` supports `--search`, `--offset`, and `--limit`. `reviews rename`, `reviews delete`, and `reviews export` manage saved snapshots. Export includes notes, progress, grouping, and AI runs. File completion uses explicit, repeatable `reviews complete ID PATH` and `reviews incomplete ID PATH` commands.

## Sync and analyze

```sh
senslop reviews sync current --mode keep --group --wait --json
senslop reviews sync current --mode new --no-group --json
senslop groups run current --wait --json
senslop reviews run current --wait --json
senslop runs list --review current --json
```

`keep` updates the current review, retains notes and AI history, and preserves completion for unchanged files. `new` creates a separate newer-edits review, retaining the previous review in history. Sync applies only to the active working-tree review on the same branch and HEAD. A branch/HEAD change requires a new review. Old AI results remain associated with their captured round.

`groups show` reads current grouping, summaries, rationale, relationships, and order. `groups run` explicitly enables grouping for the snapshot and starts or reruns it. `runs show`, `runs watch`, `runs cancel`, and `runs retry` work with grouping and correctness jobs. `runs rename` and `runs delete` manage saved correctness reviews. `runs export RUN_ID` prints combined fix guidance; `--finding N` selects one issue, and `--json` returns structured results. These commands generate instructions and never apply code changes.

`--timeout SECONDS` bounds waits; default analysis timeout is 600 seconds. A timeout retains the saved job so an agent can reconnect with `runs watch`. Failed or canceled analysis returns an unsuccessful exit status; it is distinct from a completed review with no findings. AI requests may send captured code to the chosen provider and incur that provider's charges. Source access remains read-only.

## Notes

```sh
senslop notes add current src/example.ts --body 'Check this behavior'
senslop notes add current src/example.ts --side after --start 12 --end 14 --body-file comment.txt
senslop notes list current --json
```

Notes can be listed, edited, deleted, and filtered by file or text. Line comments use exact frozen source and validated coordinates. `--body-file -` reads stdin.

CLI writes automatically refresh the open browser's reviews, analysis, notes, completion, providers, and settings. Unsaved AI instruction drafts are preserved when settings refresh. Existing keyboard shortcuts remain available in the browser.

## Help and output

Help and accepted options share one command catalog. Every command supports scoped `--help`; `help --json` exposes command/option descriptions, provider IDs, and exit codes. Use the installed help as the authoritative command reference.

Machine-oriented commands write undecorated JSON to stdout and structured errors to stderr. Noninteractive commands never wait for prompts. Deletion requires `--yes` outside an interactive terminal. Exit codes are 0 for success, 1 for operation failure, 2 for invalid usage or standalone snapshot ineligibility, 3 for an unavailable app, 4 for failed/canceled analysis, and 5 for a wait timeout.

## Development and verification

Run `pnpm dev:local` in the repository to start the source app and worker. Use `node --import tsx packages/cli/src/index.ts COMMAND` from another terminal for source CLI commands, or pass `--repo PATH`. UI edits use Fast Refresh; CLI calls load current source on each invocation. Restart the app terminal after changing launcher logic. Installed users run the bundled production app.

Build the local app before the CLI with the package build commands. The archive includes standalone Next.js, shared assets, native runtime dependencies; it excludes source workspaces and real environment files. The package remains private and is not published.

Run the ordinary suite with `pnpm test`. Existing opt-in development, installed-package, subscription, and OS credential tests remain available in their test files.
