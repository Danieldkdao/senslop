# Senslop CLI

Requires Node.js 24+ and Git. The CLI includes a production Next.js workspace. Local inspection needs no Senslop account, database connection, or cloud service.

Build the CLI and its dependencies from the monorepo root with `pnpm exec turbo run build --filter=@senslop/cli`. Then run `node packages/cli/dist/index.js --help`. After package installation, use `senslop` directly.

For dashboard development, run `pnpm dev:local` from the repository root after `pnpm install`. This runs the CLI from source and starts the workspace's installed `next dev` on loopback with the same session protection, snapshot delivery, and shutdown ownership as production. No production build or cloud configuration is required. Edit `apps/local` or `packages/ui` and Next.js refreshes the browser automatically; some changes cause a full page reload and reset in-memory notes. Next.js compilation and error output appears in the same terminal. Restart the command after editing CLI logic.

To start development with a Git selection already loaded, run `pnpm exec tsx packages/cli/src/index.ts inspect --working-tree --dev` from the root. To inspect a different repository, run `/path/to/senslop/node_modules/.bin/tsx /path/to/senslop/packages/cli/src/index.ts connect --dev` from that repository. Development mode requires the source checkout and its installed dependencies; installed production users continue to run the bundled app. `--dev` cannot be combined with `--json`.

To verify the real development server, stop any local dashboard development session and run `RUN_LOCAL_DEV_TESTS=1 pnpm exec vitest run packages/cli/src/features/workspace/tests/local-app.test.ts` from the root. This opt-in checks dashboard access protection, shared styles, local snapshot access, and shutdown. The default suite uses isolated launcher fixtures, so it can run while you develop.

Run `senslop connect` to open an empty local workspace and select changes in the same terminal. Run `senslop inspect --working-tree` to freeze and display changes immediately. Both commands print a browser URL, open it automatically, and keep the server running. In an interactive terminal, choose another inspection or stop the app from the menu. Ctrl+C or SIGTERM stops the server and removes the temporary snapshot; the child also exits if the CLI process dies unexpectedly.

`inspect` without source options prompts for a selection. Supported inputs remain `--commit HEAD`, `--range BASE..HEAD`, `--working-tree`, and `--branch feature` with optional `--base main`. No checkout occurs. Renames retain old and new paths; binary files carry metadata only. Credential-like paths and links remain excluded. Limits remain 1 MiB per file and 20 MiB per serialized snapshot, with explicit failure instead of truncation.

The local server binds to `127.0.0.1` on an available port. Its printed URL contains a random session capability used to establish a local browser cookie; keep that URL private. No account sign-in screen is involved. Code is delivered through a private temporary file and authenticated loopback requests, with no cloud relay. Refreshing restores the current snapshot while the CLI runs. Notes retain their existing in-memory behavior and clear on browser refresh. Restarting the CLI starts a fresh workspace; persisted reviews and AI remain future work.

`inspect --working-tree --json` prints an undecorated local snapshot without starting a server or opening a browser. It requires an explicit source. JSON includes the future review eligibility check and exits with code 2 if ineligible. Normal local previews accept smaller changes. Exit codes otherwise remain 0 for success and 1 for failure.

Cloud account commands remain independent: `login --url WEBSITE_URL`, `status`, and `logout`. Login opens the hosted device approval page. Enter the displayed code manually and approve it; credentials remain outside the repository with private permissions. Logout revokes the server credential before removing it locally. These commands do not start the review server. Managed models, payments, subscriptions, and provider integrations are not implemented in this refactor.

The npm archive contains built CLI files and the standalone Next.js runtime, static fonts/scripts/styles, and Material icon assets. It excludes source workspaces, real environment files, cloud account services, and database modules. The package remains private; no public npm publication has occurred.
