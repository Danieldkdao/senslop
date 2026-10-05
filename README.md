# Senslop

A website and local CLI for guided review of AI-generated code. The approved scope and contracts live in `devpost/scope.md`, `devpost/prd.md`, and `devpost/spec.md`; progress is in `devpost/checklist.md`.

## Current build checkpoint

Slice one is implemented locally on `build/slice-1-foundations`: monorepo, styled Next.js landing/account/setup pages, Better Auth device login, CLI basics, frozen Git inspection, Drizzle auth/presence schema and a separate WebSocket service. Review uploads, AI preparation, annotations and sync are later slices. The landing page is a name-only placeholder; the dashboard uses an empty review shell with real connection status.

The owner reviewed and approved this foundation branch for grouped commits and GitHub publication. Automated database/auth/presence checks have passed. Remaining live email delivery and completed provider OAuth checks are recorded separately; later review/upload slices remain unimplemented.

## What to configure now

Requires Node.js 24+ and pnpm 12.8.1. Install dependencies with `pnpm install`.

1. Create or choose a Neon project in the Neon console. Create an isolated **development branch**. Confirm your plan's branch/compute limits and costs in the console; no free-tier assumption is made. Do not use a production branch.
2. Keep local configuration in the root `.env`; `.env.example` lists the required keys. Package commands load that file through `dotenv-cli` without custom launcher scripts.
3. Open `.env` in your editor. From that development branch's Connect dialog, paste the **pooled** connection string into `DATABASE_URL` and the **direct/unpooled** string into `DATABASE_URL_UNPOOLED`. Keep `SENSLOP_DATABASE_BRANCH=development`, the localhost website URL and connection URL. Never paste credentials into chat or commit this file.
4. Run `pnpm --filter @senslop/web auth` to regenerate the single auth schema, `pnpm db:generate` to generate migration SQL, and `pnpm db:migrate` to apply it. The migration runner refuses pooled URLs and requires the development label. That label is a guard, not proof of branch identity: confirm the URLs belong to the development branch in the console.
5. Run `pnpm dev` to start web, the connection service and a CLI build watcher. Regenerate schemas and migrations after changing auth plugins. Trigger.dev is added with the review-preparation slice; it is not a fake worker in this checkpoint.
6. Open http://localhost:3000/signup, create an account (password minimum 12 characters), verify the emailed code, and sign in. Build the CLI with `pnpm --filter @senslop/cli build` if needed. In the root of this repository run:

```sh
node packages/cli/dist/index.js login --url http://localhost:3000
node packages/cli/dist/index.js connect
```

Login opens the approval page in your default browser and prints its URL and code as a fallback. Sign in, enter the code from your own terminal into the blank field, check it, and explicitly approve. Keep `connect` running in that terminal; use a second terminal for other commands. The website setup checklist changes automatically when presence arrives. Ctrl+C disconnects without signing out. `logout` revokes the credential and removes its private local file.

No npm account is needed for local use. The current web environment schema requires Mailjet, Google, GitHub, OpenRouter and Trigger.dev configuration. Configure `MAILJET_API_KEY`, `MAILJET_API_SECRET`, and a Mailjet-verified `SENDER_EMAIL` in the root `.env`; restart running dev servers after adding environment variables. Model IDs and bounded operator budgets are checked before real AI requests in slice two. Railway and public npm release are later distribution checkpoints.

## Run the web app on its own

Run `pnpm dev:web` or `pnpm --filter @senslop/web dev`; both use Next.js tooling and the root `.env`. The connection service is started separately with `pnpm --filter @senslop/connection-server dev` or together with `pnpm dev`.

Google OAuth needs `http://localhost:3000/api/auth/callback/google` registered as an authorized redirect URI. GitHub OAuth needs `http://localhost:3000/api/auth/callback/github` as its callback URL. Production uses the website's HTTPS origin. Sign-in preserves the CLI device approval destination and still requires explicit code approval. Email/password accounts must verify their email with a six-digit code before signing in. OTP verification returns to the saved CLI destination; Google and GitHub continue through their provider flows. The landing page is public; dashboard/device pages require a verified session. Signed-in visitors to login/signup return to their saved destination or the dashboard.

## Inspect Git inputs locally

```sh
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js inspect --commit HEAD
node packages/cli/dist/index.js inspect --range BASE..HEAD
node packages/cli/dist/index.js inspect --working-tree
```

To inspect a different repository, change to its directory and invoke Senslop using the absolute path to this repository's `packages/cli/dist/index.js`. `inspect --json` prints exact selected contents; avoid sharing that output indiscriminately. Inspection does not upload code or invoke AI. Five text files must each have ten added+deleted lines for eligibility; smaller files stay included. Binary files are metadata only. Credential-like paths, symlinks and unsupported entries are explicitly reported. This path policy does not guarantee arbitrary source text contains no secrets. Limits reject excessive input rather than truncating it.

## Review the boundaries

- `apps/web`: Next.js browser UI and authenticated HTTP APIs; OpenRouter and task integration arrive later.
- `apps/connection-server`: Express/ws presence, one-use tickets and heartbeat revalidation. Run one replica initially.
- `packages/cli`: Local command parsing, credential storage, Git snapshots and bundled executable.
- `packages/contracts`: Shared source/protocol/presence/eligibility definitions.
- `packages/database`: Server-side pg/Drizzle auth/presence schema and migrations. Never imported into CLI or client UI.
- `packages/review-core`: Reserved for deterministic ordering, coverage, sync matching and prompt logic in later slices.

Internal packages currently export TypeScript source consumed by Next.js or bundled by tsup. Their build checks type safety; application builds produce runnable outputs. The CLI `bin` maps the installed `senslop` command to JavaScript with a Node shebang; it bundles workspace code. Building is not publishing. CLI packaging will be proven with an archive installed outside this monorepo before public release.

## Verify

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Tests run in Vitest with matchers, spies and fake timers. They use real Git repositories, the installed Better Auth plugins with a deterministic memory adapter, and real local sockets with injected identity/ticket fixtures. The default suite uses isolated fixtures. Opt-in Neon integration (`RUN_LIVE_TESTS=1` with the root `.env` loaded) additionally verifies persisted device approval, account isolation, one-use ticket consumption and logout revocation using disposable accounts. `RUN_LIVE_HTTP_TESTS=1` enables the actual Next/Express transport test when both apps are running; it verifies account-isolated presence, ticket replay rejection, disconnect/reconnect and immediate logout socket revocation. Actual browser appearance and completed provider OAuth remain hands-on checks. No credentials are logged.

Environment variables are validated with T3 Env Core in each server or CLI env module. Standard commands load the root `.env`, and Turbo forwards all declared service variables. Builds validate configuration too. Application code imports the shared `db` directly. Migrations retain a separate direct connection and close it when finished.
