# Senslop CLI (local development)

Requires Node.js 24+ and Git. Build with `pnpm --filter @senslop/cli build`, then run `node packages/cli/dist/index.js --help` from the monorepo root.

The `bin` mapping gives the executable its `senslop` name after package installation. The first line of built JavaScript is a Node shebang. Normal output goes to stdout, failures to stderr. Exit codes: 0 success, 1 invalid arguments/service failure, 2 ineligible inspected change.

The human interface uses `@clack/prompts` for a command menu, source selection, progress, and cancellation. Run `senslop` without arguments to choose a command. `login` prompts for the website URL in a terminal; scripts must pass `--url`.

`login --url http://localhost:3000` opens the approval page in your default browser and displays its URL as a fallback. Enter the terminal code into the blank browser field, then explicitly approve. Approve only a code requested on your own computer. `connect` keeps presence alive; run other commands in a second terminal. Credentials live outside the repository with private file permissions. `logout` revokes the server credential before removing it locally.

`inspect --commit HEAD`, `inspect --range BASE..HEAD`, and `inspect --working-tree` freeze and inspect changes without upload. `inspect` alone prompts for a source in a terminal. Explicit source flags remain available for automation. Add `--json` with an explicit source to print only the snapshot JSON, without prompts or progress output; treat that output as repository data. Credential-like paths and links are explicitly reported as excluded; other text may still contain sensitive material. Binary entries are metadata only.

Review upload, AI context tools and sync arrive in later slices. This package is private until clean-archive testing and name/license decisions are complete. No public npm publication has occurred.
