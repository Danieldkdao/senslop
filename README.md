# Senslop

A local browser workspace for reviewing Git changes. `apps/local` is bundled into `packages/cli`; the CLI starts and stops its protected loopback server. Local review needs no cloud account. The hosted `apps/web` keeps its authentication and placeholder dashboard.

The current requirements and historical decisions live in [devpost/prd.md](devpost/prd.md) and [devpost/spec.md](devpost/spec.md). The October 9 additions authorize browser inspection, durable local reviews, and provider configuration. AI generation remains future work.

## Run locally

Requires Node.js 24+, Git, and pnpm 12.8.1 for development.

```sh
pnpm install
pnpm exec turbo run build --filter=@senslop/cli
node packages/cli/dist/index.js connect
```

Open the printed browser URL, select changes, and click **Inspect changes**. Keep that terminal open; Ctrl+C shuts down its server. You can also inspect directly:

```sh
node packages/cli/dist/index.js inspect --working-tree
node packages/cli/dist/index.js inspect --commit HEAD
node packages/cli/dist/index.js inspect --range BASE..HEAD
node packages/cli/dist/index.js inspect --branch feature --base main
```

Run from the repository you want to review. Browser operations stay bound to that repository. Latest commit means local HEAD; inspection never fetches, pulls, checks out, or modifies Git state. The terminal menu remains available in an interactive terminal. `--json` produces pure JSON without a dashboard.

Use **Saved reviews** to reopen, rename, or explicitly delete frozen snapshots and their notes/progress. Browser refreshes and CLI restarts preserve them. The dashboard indicates when the current repository differs from the inspection state. Repository histories stay separate.

Open **Settings → Providers** to securely save API keys and select a default for future reviews. Only the twelve requested providers are supported. Remote keys save on Enter or when you leave the key form; shared password inputs provide reveal/hide controls. Local providers offer endpoint presets and context options. Model selection belongs to a future review flow. Saving automatically checks the saved connection and shows feedback; failed checks keep securely saved settings and remain visible across settings refreshes until another check replaces them or settings close. Retry uses the saved credential. API keys are stored in the OS credential store; other configuration is SQLite. A remote compatible endpoint is identified as remote. Saving settings does not invoke inference or send source.

See [packages/cli/README.md](packages/cli/README.md) for local storage locations, credential-store requirements, development mode, packaging, and troubleshooting.

## Development and verification

```sh
pnpm dev:local
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`dev:local` runs the local dashboard through the CLI with Next.js refresh and owned shutdown. The default behavioral suite uses isolated Git, persistence, provider, and transport fixtures. No dedicated schema tests are used.

Opt-in verification exercises real local servers and disposable OS credentials:

```sh
RUN_LOCAL_DEV_TESTS=1 pnpm exec vitest run packages/cli/src/features/workspace/tests/local-app.test.ts
RUN_OS_CREDENTIAL_TESTS=1 pnpm exec vitest run apps/local/src/services/credentials/tests/os-credentials.test.ts
SENSLOP_PACK_TEST=1 pnpm exec vitest run packages/cli/tests/packaged-workspace.test.ts
```

The package check installs an npm archive outside the monorepo, exercises inspection and restart persistence, and verifies installed native credential storage. It removes its disposable review records and credentials afterward. Building and packing do not publish anything.

## Architecture and hosted development

- `apps/local`: protected local Next.js review UI, Git/history APIs, and provider settings. No hosted authentication or Postgres dependency.
- `packages/cli`: Git commands, one-terminal lifecycle, disposable snapshot handoff, and standalone packaging.
- `packages/review-core`: shared Git capture and local SQLite review storage.
- `packages/contracts`: validated snapshot, note/progress, and nonsecret provider contracts.
- `packages/ui`: generated UI primitives and the owner's theme.
- `apps/web`, `apps/connection-server`, `packages/database`: existing hosted account/device/presence services. They do not receive local source, snapshots, notes, history, or provider keys.

Hosted development still uses the root `.env` with typed T3 Env Core validation. `.env.example` documents its service variables. Choose an isolated Neon development branch before applying migrations; pooled and direct URLs have separate roles. `pnpm --filter @senslop/web auth` regenerates the single auth schema; `pnpm db:generate` and `pnpm db:migrate` manage hosted migrations. `pnpm dev:web` runs the website; `pnpm dev` also starts the presence service and CLI watcher. Mailjet and OAuth configuration are needed for their corresponding hosted account flows. None are prerequisites for local review.

The local workspace uses one file header: **New review** opens Git selection, **Saved reviews** searches local history, and **Settings** combines appearance, editor, and provider configuration. Remote API keys save on blur or Enter; models can be chosen later. Nested settings contents expand/collapse. Below the Editor controls, a live sample diff previews every display setting, including word/character highlighting, unchanged context, and wrapping. Press `d` to toggle completion for the selected file. Completed files show checkmarks and themed outlines. Enter submits notes and comments, while Shift+Enter adds a newline.
