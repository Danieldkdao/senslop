# Senslop CLI (local development)

Requires Node.js 24+ and Git. Build with `pnpm --filter @senslop/cli build`, then run `node packages/cli/dist/index.js --help` from the monorepo root.

The `bin` mapping gives the executable its `senslop` name after package installation. The first line of built JavaScript is a Node shebang. Normal output goes to stdout, failures to stderr. Exit codes: 0 success, 1 invalid arguments/service failure, 2 ineligible inspected change.

The human interface uses `@clack/prompts` for a command menu, source selection, progress, and cancellation. Run `senslop` without arguments to choose a command. `login` prompts for the website URL in a terminal; scripts must pass `--url`.

`login --url http://localhost:3000` opens the approval page in your default browser and displays its URL as a fallback. Enter the terminal code into the blank browser field, then explicitly approve. Approve only a code requested on your own computer. `connect` keeps presence alive; run other commands in a second terminal. Credentials live outside the repository with private file permissions. `logout` revokes the server credential before removing it locally.

`inspect --working-tree`, `inspect --commit HEAD`, and `inspect --range BASE..HEAD` freeze selected changes and stream before/after source and patches to your open dashboard. Keep `connect` running in a separate terminal under the same account. `inspect` alone prompts for a source. Inspection accepts small changes and does not run AI or save source in the database; reloading the dashboard clears the displayed changes.

`inspect --branch feature` compares the current HEAD to the selected branch without checking it out. Add `--base main` to compare a different base. Branch comparisons can span unrelated endpoints; `--range` requires an ancestor-to-descendant range. Renames retain their old and new paths; binary changes carry metadata only. Credential-like paths and links remain excluded. Transfer limits are 1 MiB per file and 20 MiB per serialized snapshot; oversized selections fail without truncation.

Add `--json` with an explicit source for local-only inspection. It prints only snapshot JSON, without prompts, progress, or upload. Treat that output as repository data. JSON output includes the future review eligibility check and exits with code 2 when the selected change is ineligible.

Persisted reviews, AI context tools and sync arrive in later slices. This package is private until clean-archive testing and name/license decisions are complete. No public npm publication has occurred.
