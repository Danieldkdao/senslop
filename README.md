# Senslop

Senslop is a local code review workspace for understanding changes, finding bugs, and checking fixes before pushing. It is built for developers reviewing their own work or changes produced by coding agents.

The CLI starts a protected browser app and a local background job engine for your Git repository. Reviews, frozen source, notes, decisions, and history stay in local SQLite storage; ordinary diff review needs neither a Senslop account nor an AI provider.

## Features

- **Review the changes you choose:** capture your working tree, a commit, a revision range, or a local branch comparison, with immutable before/after evidence and saved review rounds.
- **Read changes in context:** split/unified diffs, AI summaries, editable flows of changed regions, per-region completion, file overview, symbol/content search, impact links, and a reading-history trail.
- **Investigate with AI:** source-aware chat, selected-code explanations, and explicit correctness reviews using configured API providers, subscription connections, local model servers, or compatible endpoints.
- **Act on findings:** accept, dismiss, resolve, or reopen issues while keeping model assessments, passing checks, and human decisions separate.
- **Fix and verify:** hand selected findings to an external agent, inspect returned edits, apply selected files, and run chosen tests or commands against the exact captured revision.
- **Finish with Git:** stage files or hunks, commit with existing hooks/signing, fetch, pull with fast-forward only, and push through existing Git authentication; optionally check outgoing review coverage before pushing.
- **Retain useful context:** file/line notes, explicit scoped project memory, request/acceptance-criteria review, repository rules/profiles, and immutable HTML/JSON round reports.
- **Work across projects:** saved reviews, sibling worktrees, independent browser tabs, background jobs, queue controls, source/model policies, and usage budgets.
- **Keep the workspace comfortable:** searchable settings, command palette, focused reading, recoverable note/chat/commit drafts, smooth disclosures, optional desktop notifications, themes, and a configurable buddy.
- **Inspect review quality:** a deterministic evaluation corpus and opt-in live findings/grouping runs with saved comparisons, evidence metrics, latency, and available usage data.

JavaScript/TypeScript has compiler-backed analysis; Python/Go has packaged parsing and optional local semantic-server integration. Unsupported files remain reviewable as text or explicit binary fallbacks.

## Try it locally

The CLI package is currently private; the supported try-out path is this source checkout. Requires **Node.js 24.x or 26+**, **Git**, and **pnpm 12.8.1**.

Clone the repository or use your existing checkout, then build from its root:

```sh
git clone https://github.com/Danieldkdao/senslop.git
cd senslop
pnpm install --frozen-lockfile
pnpm exec turbo run build --filter=@senslop/cli
```

Start the built app for an existing Git project:

```sh
node packages/cli/dist/index.js app start --repo /absolute/path/to/your/project
```

Keep that terminal open; it owns the browser app and background jobs. Senslop opens the local workspace automatically. From a second terminal, still in the Senslop checkout, capture the target project's uncommitted changes without AI:

```sh
node packages/cli/dist/index.js reviews create --repo /absolute/path/to/your/project --working-tree --no-group --open --json
```

Use a project with an uncommitted change to explore the diff, or choose a commit, range, or branch in the browser. Small changes are supported. Inspection itself reads Git without changing your source or index.

To stop, press Ctrl+C in the owning terminal, or run:

```sh
node packages/cli/dist/index.js app stop --repo /absolute/path/to/your/project --json
```

Saved reviews survive shutdown. Closing a browser tab does not stop the app.

## A typical review

1. Create a review, open the diff, and add notes or mark regions complete.
2. Optionally configure a model and request grouping, chat, explanations, or a correctness review; grouping alone does not run correctness analysis.
3. Select findings to create a fix task or request verification; the app shows feedback and opens the corresponding Work tab.
4. Copy/export the task handoff to your external agent, which claims and returns it through the CLI; automatic agent launching is not implemented.
5. Inspect returned edits before applying selected files, then run a relevant check in Work → Checks; `node --version` is a simple first command, while project tests may require explicitly installing dependencies in that execution workspace.
6. Inspect the verification outcome and evidence, make your finding decisions, and export a round report if useful.
7. Open Git to stage, commit, inspect outgoing coverage, and push when ready.

Checks run with host permissions in managed Git worktrees, which are separate directories rather than an OS sandbox. Human actions authorize source changes and Git operations; model findings do not apply or commit fixes automatically.

## Configure optional AI and notifications

Open Settings → AI/Providers to add a provider connection, sign in to a supported subscription, configure a local model server, or add an OpenAI-compatible endpoint. Assign a shared task model or separate Grouping, Context, Review, and Explain models; chat has its own model picker. Provider connection checks inspect metadata and do not establish inference quality or account compatibility.

Credentials use the OS credential store, with no plaintext fallback. Remote inference can send permitted captured context to the selected provider and incur its charges; source policies can restrict included paths and require local inference.

Settings → Notifications requests browser permission before enabling desktop delivery, and every activity category starts off. Enable the categories you want and use Test notification to check browser submission; foreground alerts are optional, and the local owner plus a workspace tab must stay running. App/CLI update notices are separate, while Settings → About contains version information and sanitized diagnostics.

## Build and develop from source

The filtered build above includes shared package checks, compiles the frozen-source analysis worker, builds the standalone Next.js app, and bundles it with the CLI. You can also rebuild the app and CLI explicitly, in that order:

```sh
pnpm --filter @senslop/local build
pnpm --filter @senslop/cli build
```

For local UI development against the Senslop repository:

```sh
pnpm dev:local
```

To use development mode with another project instead:

```sh
node --import tsx packages/cli/src/index.ts app start --dev --repo /absolute/path/to/your/project
```

The CLI starts both Next.js development mode and the local job engine. UI changes use Fast Refresh; use `node --import tsx packages/cli/src/index.ts COMMAND` for source CLI calls from another terminal. Restart the owner after changing launcher logic, and stop it before switching between development and production modes for the same project.

Local review requires no hosted database, cloud account, or hosted `.env` setup. Native parser/runtime dependencies use the installation policy in [pnpm-workspace.yaml](pnpm-workspace.yaml). Hosted development in `apps/web` is separate and uses its own environment configuration.

### Verification commands

```sh
pnpm test
pnpm --filter @senslop/local typecheck
pnpm exec tsc --project tsconfig.tests.json --noEmit
pnpm --filter @senslop/local lint
```

Ordinary tests use deterministic fixtures; process/archive, OS-credential, and live-provider checks have separate prerequisites and opt-ins. Root `pnpm typecheck`, `pnpm lint`, and `pnpm build` include hosted workspaces, whose environment requirements also apply. See the [verification ledger](devpost/checklist.md) for recorded results and remaining release checks.

## Documentation

The complete local review workflow is available on `main`.

Read the [scope](devpost/scope.md), [PRD](devpost/prd.md), [technical spec](devpost/spec.md), [delivery roadmap](devpost/local-review-roadmap.md), and [CLI reference](packages/cli/README.md). Dated research documents preserve earlier investigations rather than define current behavior. This project uses the [MIT license](LICENSE.md).
