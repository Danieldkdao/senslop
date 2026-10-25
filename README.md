# Senslop

A local code review workspace for understanding changes and catching bugs before pushing. The CLI starts a protected browser app and local background job engine. Local review needs no Senslop account.

Senslop captures Git changes, organizes related files into a suggested reading order, provides source-aware chat and selected-code explanations, and can run AI correctness reviews with original evidence and fix prompts. Saved reviews retain notes, progress, conversations, and analysis history.

## Run from a source checkout

Requires Node.js **24.x or 26+**, Git, and pnpm **12.8.1**.

```sh
pnpm install
pnpm exec turbo run build --filter=@senslop/cli
node packages/cli/dist/index.js app start --repo /absolute/path/to/project
```

Keep that terminal open. The CLI prints/opens the local browser workspace. In a second terminal, run commands against the same project:

```sh
node packages/cli/dist/index.js app status --repo /absolute/path/to/project --json
node packages/cli/dist/index.js reviews create --repo /absolute/path/to/project --working-tree --no-group --open --json
```

Choose changes in the browser instead if preferred. Supported sources are working-tree changes, one commit, an endpoint range, or a local branch comparison. Inspection reads Git without checking out, fetching, or editing files. Small changes are supported.

The package remains private and is not published at the recorded baseline. These instructions use the checkout's built CLI; see [CLI documentation](packages/cli/README.md) for installed-package commands, packaging, storage, and troubleshooting.

## Configure AI when wanted

Open Settings → Providers to save an API key, connect a supported subscription, configure a local server, or add an OpenAI-compatible endpoint. Connection checks use metadata only. Credentials use the OS credential store; saved keys are not returned to the browser.

Choose a shared model or separate Grouping, Context, Review, and Explain models in Settings → AI. Chat has its own model picker. With grouping configured, prepare a grouped review:

```sh
node packages/cli/dist/index.js reviews create --repo /absolute/path/to/project --working-tree --group --open --wait --json
```

Grouping does not implicitly request a correctness review. Run one explicitly from the Review panel or with `reviews run REVIEW_ID --wait --json`. Copy a finding's fix instructions or export them through the CLI; Senslop does not currently apply fixes or run project tests.

Remote inference may send captured source to the chosen provider and incur provider charges. Local UI/storage does not imply local inference. Ordinary diff review works without AI configuration.

## Review and revisit

- Read split/unified diffs, file summaries, related-file groups, and original finding evidence.
- Search files with **K**, mark completion with **D**, and use arrow navigation where available.
- Add file/line notes; Enter submits and Shift+Enter inserts a newline.
- Reopen, rename, or delete saved reviews. History searches names and recorded folders, groups the current app folder first, and labels legacy reviews without a folder.
- Re-sync a specified working-tree review on the same branch/HEAD: keep mode retains its identity, notes/history, and unchanged-file completion; new mode creates a separate newer-edits review.
- Customize editor/app themes, fonts, diff options, panels, review preferences, and the optional floating buddy.

The app owner must remain running for background jobs. Additional CLI clients create reviews in the background; the first review opens automatically and `--open` explicitly opens another in a dedicated tab. Existing tabs keep their reading state. Captures retain the caller folder, history shows preparation and optional-analysis status, and jobs support cancellation, retry, priority, and restart recovery. Shared request/token limits and a total AI request ceiling coordinate repository processes in the same data directory. Use explicit review IDs and revision expectations for automation. Completion notifications, finding decisions, fix verification, and in-app Git push/pull remain future work.

## Development and verification

```sh
pnpm dev:local
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`dev:local` starts the source local app and worker through the CLI. Stop the app terminal after testing. Root build/typecheck commands include hosted workspaces and their environment requirements; targeted package checks can be used for local-only changes.

Default tests use deterministic fixtures. Opt-in process, package, real credential, and live-provider scenarios require separate execution; a passing unit suite does not certify those environments. See the [verification ledger](devpost/checklist.md) and [CLI README](packages/cli/README.md).

## Repository guide

| Location               | Responsibility                                                                  |
| ---------------------- | ------------------------------------------------------------------------------- |
| apps/local             | Local review UI, protected APIs, model/analysis services, jobs, and settings    |
| packages/cli           | App lifecycle, structured commands, agent skill, and standalone packaging       |
| packages/review-core   | Git capture and local SQLite review persistence                                 |
| packages/contracts     | Shared Zod contracts and constants                                              |
| packages/ui            | Shared components, theme infrastructure, and shortcuts                          |
| apps/web               | Separate hosted authentication/device flows, landing, and placeholder dashboard |
| apps/connection-server | Separate hosted Express/ws presence service                                     |
| packages/database      | Hosted Drizzle/Neon schema and database infrastructure                          |

Local review does not require hosted Postgres, Mailjet, OAuth, or a hosted inference proxy. Hosted development retains its own environment setup through `.env.example` and typed env modules; `pnpm dev:web` starts that separate web app.

## Current documents and future work

Start with [scope](devpost/scope.md), [PRD](devpost/prd.md), and [technical spec](devpost/spec.md). They describe the current local application. [Checklist](devpost/checklist.md) separates implemented foundations from verification still outstanding.

The [20-feature roadmap](devpost/local-review-roadmap.md) preserves the next-stage vision, acceptance criteria, code entry points, and new-chat handoff. Background reviews, explicit IDs, and concurrency are grouped as feature 1. Dated research notes are historical rationale, not alternate current architecture.
