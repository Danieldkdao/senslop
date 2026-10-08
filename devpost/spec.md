---
doc: spec
status: approved
---

# Senslop — Technical Spec

## How This Works, In Plain Language

The CLI runs on the developer's computer. After browser-approved login, it reads the Git change the developer selects and runs read-only AI agents to find related definitions and types. The tools read locally, while their model requests pass through Senslop's authenticated cloud proxy. Senslop pays for inference and keeps its OpenRouter key on the server. A compact context map goes to the cloud with the actual selected code and diff; the summary is background context, not a screen the user must read.

The website saves that upload in Neon Postgres and asks Trigger.dev to prepare the review. The job divides code into sections, groups related changes, and recommends an order. The website displays the result and saves notes and completion progress. Inline explanations use the selected code plus the saved context. Continue sync preserves confidently matched progress and all notes; full sync warns and then resets everything in that review.

The website and a small WebSocket connection service run on Railway. HTTPS carries commands, uploads, and inference requests. A persistent WebSocket reports whether the CLI is connected. Trigger.dev runs the background tasks. The CLI is distributed as an npm package; it is not a Railway-hosted process.

## The Core Journey Through the System

Implements `prd.md > The Core Journey`.

1. Browser signs in through Better Auth, with its records stored using Drizzle in Neon.
2. CLI requests a device code; the developer opens the website, manually enters the terminal code in a blank field, and explicitly approves the connection. The CLI receives a revocable credential.
3. `senslop connect` maintains presence through the WebSocket service; the setup checklist changes to the connected interface.
4. A review command resolves Git inputs to immutable revisions or a frozen working-tree snapshot, creates a bounded context-analysis session, and runs local tools through AI SDK agents.
5. CLI uploads before/after file contents, deterministic diff data, source identity, and a context summary over HTTPS. Server rechecks eligibility and saves the pending snapshot.
6. Trigger.dev loads the snapshot by ID, calls OpenRouter, validates the resulting sections, groups, and relationships, and commits the prepared review atomically.
7. Browser polls the authenticated status endpoint while preparing, then reads groups and files. Notes and completion updates save to Neon.
8. The explanation endpoint receives exact selection coordinates and returns contextual streamed text for the floating bubble.
9. A deterministic prompt formatter includes every note and its original file/code reference. It does not need another model call.
10. A sync command uploads a new snapshot of the selected source. Continue mode matches progress conservatively; full mode requires reset confirmation before any destructive publication.

## Stack

Learner-selected: Neon Postgres, Drizzle ORM, Better Auth, OpenRouter, Trigger.dev, shadcn/ui, WebSockets, Vercel AI SDK agents/subagents, Railway, pnpm workspaces, and Turborepo.

Existing project baseline: Next.js 16.3.8, React 19.2.8, TypeScript, Tailwind CSS 4, and pnpm 12.8.1, as recorded in the current package manifest. Preserve those initially; inspect bundled Next.js documentation under `node_modules/next/dist/docs/` before implementation, as required by the project's AGENTS.md.

Implementation proposals for this draft:

- TypeScript throughout; Node.js 24 LTS runtime subject to provider compatibility checks in the initial build checkpoint.
- `drizzle-orm/node-postgres` with `pg` pools for the long-running Railway services and task runtime. Use pooled runtime URLs and a direct URL for migrations. [Drizzle/Neon](https://orm.drizzle.team/docs/connect-neon), [Neon connection pooling](https://neon.com/docs/connect/connection-pooling).
- Zod schemas in the shared contracts package; `ws` for the connection service; Node's argument parser for the initial CLI. [Zod](https://zod.dev/), [ws](https://github.com/websockets/ws), [Node parseArgs](https://nodejs.org/api/util.html#utilparseargsconfig).
- AI SDK OpenAI-compatible provider against Senslop's proxy in the CLI; the server calls OpenRouter. Pin mutually compatible SDK/provider majors, verified before installation. Do not mix snippets from different AI SDK generations. [Compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers), [Subagents](https://ai-sdk.dev/docs/agents/subagents), [OpenRouter provider changelog](https://github.com/OpenRouterTeam/ai-sdk-provider/blob/main/CHANGELOG.md).
- Model roles are server-configured: `context`, `review`, and `explain`. Exact model IDs are not chosen yet; validate configured models against OpenRouter before live tests. The context role needs tool calling; the review role needs structured output. No public arbitrary-model proxy.
- New dependency versions must be checked and pinned in the lockfile during the first build checkpoint; the researched documentation is not proof that a combination has been installed or tested.

## Where It Runs and How Someone Tries It

Local development uses the same Neon, OpenRouter, and Trigger.dev interfaces as the eventual hosted app. Create an isolated Neon development branch before applying migrations. Do not provision or migrate a production database during planning.

Planned root commands:

```text
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm dev` runs the web app on `http://localhost:3000`, connection service on `ws://localhost:3002`, and Trigger.dev development worker through Turborepo. The root script will provide explicit startup failures for missing configuration. Open the website, create an account, and run the locally built CLI against that base URL.

Planned CLI commands:

```text
senslop login --url http://localhost:3000
senslop connect
senslop review --commit HEAD
senslop review --working-tree
senslop review --range BASE..HEAD
senslop sync REVIEW_ID --continue --working-tree
senslop sync REVIEW_ID --full --working-tree
senslop logout
```

Run `connect` in one terminal and review/sync commands in another. Review commands may also establish temporary presence; the persistent connect process supplies the ongoing indicator. All commands use HTTPS/WSS in production; localhost is the development exception. CLI needs Node and Git, but does not need the source repository of Senslop.

Railway deployment: build the web and connection services separately from this monorepo, supply service-specific environment variables, configure their public domains, and point the CLI at the website URL. Keep the initial connection service at one replica; multi-replica presence requires an additional coordination mechanism and is deferred. Deploy the task entry point to Trigger.dev separately. [Railway Next.js](https://docs.railway.com/guides/nextjs), [Railway realtime connections](https://docs.railway.com/guides/sse-vs-websockets), [Trigger.dev](https://trigger.dev/docs).

Record a short demo showing setup, an eligible cross-file review, an explanation, a note, a group celebration, and the final prompt. A public GitHub repository and video remain submission materials; deployment does not replace them. No one-minute cap is assumed.

## Look and Feel

Implements `prd.md > Look and Feel`.

Use shadcn/ui components with Tailwind theme variables, avoiding hard-coded colors in review components. Load Fraunces, Outfit, and JetBrains Mono using the Next.js font pipeline. The current foundation uses the owner’s existing palette with Light, Dark, and System appearance modes; next-themes persists the browser choice and follows OS changes in System mode. Additional palettes, account-synced preferences, and alternative code fonts remain later work.

Auth pages share a full-height centered `(auth)` layout without a site header. Keep the buddy and title/subtitle inside the card, followed by stacked provider buttons, a ruled divider, the React Hook Form/Zod fields, and account switching. Compose the owner’s existing `PasswordInput` and `PasswordInputStrengthChecker`; retain its local password scoring and use existing semantic colors in both light and dark mode. The reference’s auth titles use Outfit; general headings retain Fraunces. Password recovery is omitted for this design by owner instruction. The root layout owns fonts and providers; the dashboard layout owns the review workspace shell, with no separate marketing/site header. The landing page currently contains only “Senslop”.

The dashboard layout wraps its authenticated page in `ReviewWorkspace`: installed shadcn resizable panels, an empty file sidebar, a center file header and scrollable connection checklist, and a buddy/notes sidebar with a profile menu. The server layout reads the verified session through `getCurrentUser` inside Suspense and passes only name, email, and image to the client shell. The reusable avatar falls back to formatted initials while its image loads or fails. Account actions are Settings, nested Change theme, and destructive Sign out; Settings currently opens a read-only account-details dialog. Sign-out errors use the shared toast and permit retry. Below 1024px, sidebars and resize handles disappear; Files/Notes header buttons open native shadcn Sheet drawers using the same panel content. Desktop dividers and horizontal workspace borders are 1px thick. Use the installed shadcn `ResizableHandle withHandle` for its native visible grip and keyboard focus styling. Application styling only accents the divider on hover/drag; do not override the grip’s size, positioning, or ring. Command text and copy buttons align vertically. The existing presence hook drives setup, reconnecting, and connected-with-no-review states; no uploaded-file state is invented before upload persistence exists. Compose the installed Base UI shadcn radio dropdown for the appearance control, with Lucide Sun, Moon, and Monitor icons and hydration-safe selected state. File rendering and transition animation remain deferred.

Use shadcn resizable panels, collapsibles, buttons, dialogs, inputs, and popovers. Use CSS motion for the buddy and anchored explanation transitions, with reduced-motion support. Keep code readable at desktop review density. Theme and font settings change immediately and persist with the account. [shadcn/ui](https://ui.shadcn.com/docs/components), [Resizable](https://ui.shadcn.com/docs/components/radix/resizable), [Next.js fonts](https://nextjs.org/docs/app/getting-started/fonts).

## Components

### Shared Contracts

Implements all `prd.md > Features and Behavior` interfaces. Export types plus runtime validators for Git source selections, upload manifests, context maps, job states, groups, file sections, selections, notes, and WebSocket events. Include a protocol version; reject unsupported versions with an actionable upgrade message. Package boundaries keep database access and secrets out of CLI and browser bundles.

### CLI and Git Snapshot Collector

Implements `prd.md > Account Connection and Local Git Submission` and `prd.md > Submission Eligibility`.

Resolve user revisions using Git argument arrays, never shell-interpolated commands. Freeze all content before context gathering so later edits cannot silently alter the upload. Source definitions proposed for review:

- Single commit: first parent to selected commit; root commit uses an empty tree. Merge commits use the first-parent delta and report that choice.
- Range: endpoint-to-endpoint diff from BASE to HEAD, not a separate review per intermediate commit. Reject invalid or reversed ancestry selections with an explanatory message.
- Working tree: tracked staged and unstaged content compared to HEAD, plus eligible untracked text files. Preserve Git ignore rules; report excluded credentials and unsupported files rather than silently hiding them.

Count changed lines as additions plus deletions per file, excluding diff headers. Five files must each reach ten changed lines. Added files count added lines; deleted files count deleted lines. Smaller changed files still appear. Both CLI and server use the same validation rules.

The implementation must correctly preserve paths, deleted files, renamed files, and old/new line coordinates. Symlinks do not grant reads outside the repository. Binary files appear as explicit metadata-only entries and do not satisfy text-line eligibility; their contents cannot be explained as code. Oversized selected input is rejected explicitly rather than truncated. [Git diff](https://git-scm.com/docs/git-diff), [Revision resolution](https://git-scm.com/docs/git-rev-parse).

### Local Context Agents and Cloud Inference Proxy

Implements `prd.md > AI Preparation and Recommended Review Order`.

CLI orchestrates an AI SDK parent agent with narrowly scoped subagents for independent relevant areas. Tools are read-only: list allowed repository paths, search text, and read bounded line ranges from the frozen snapshot. No tools execute project scripts, edit files, or run arbitrary shell commands.

The context map contains referenced paths, definition/type locations, relationships, concise rationale, and unresolved references. Reads for commit/range reviews use the relevant Git snapshots, not an unrelated current checkout. The final compact summary is internal. Model requests can include inspected code; local orchestration does not imply local model inference or that only a summary ever reaches providers. Bound each call by the configured model context window, with a compatible token counter or a conservative byte-based upper bound, and reserve output capacity before sending. Summarize intermediate tool results into bounded context; stop with an explicit budget error if useful context cannot fit.

Proxy authenticates the CLI credential, checks context-session ownership, accepts only allowlisted model roles, bounds requests, and forwards OpenAI-compatible chat-completion requests to OpenRouter. It preserves tool-call messages and streamed completion events needed by the local agent loop. OpenRouter credentials never enter the CLI package.

Proposed initial engineering bounds: two parallel subagents, twenty tool steps per agent, 20 MiB snapshot upload, 1 MiB per text file, 120-second inference request timeout, and three total attempts for a transient provider failure. Exceeding a limit produces a clear error; it never drops selected code silently. These bounds require review and empirical tuning before wider use.

### Authentication and CLI Credentials

Implements `prd.md > Arrival and Setup` and `prd.md > Account Connection and Local Git Submission`.

Current owner-approved authentication: email/password plus Google/GitHub through self-hosted Better Auth backed by Drizzle. Require email verification for password sign-in. The email OTP plugin overrides link verification, sends six-digit codes through Mailjet on signup and unverified sign-in, expires them after fifteen minutes, and automatically signs in after verification. The shared verification form validates with React Hook Form/Zod, allows cooldown-controlled resend, retains code errors inline, and announces submission/service feedback through the existing toast manager. Preserve the safe CLI continuation through signup, sign-in and verification. Use the first-party Better Auth device-authorization plugin plus the bearer plugin for the Senslop CLI. Centralize Next.js server session reads in `src/lib/auth/helpers.ts > getCurrentUser`, disabling cookie-cache checks so revocation is verified against the server. `src/proxy.ts` handles page routing: landing is public, dashboard/device require a verified session, and verified login/signup visitors return to their safe continuation or dashboard. Keep authorization in protected server pages and APIs too; the CLI status route passes bearer-only headers and browser tickets require cookie headers plus the correct origin. Browser components use Better Auth client hooks because the helper imports server request context; standalone services call the authenticated web API. The browser retains cookie sessions. The verification page starts with an empty code input even when a URL contains `user_code`. Better Auth checks the entered terminal code before explicit approve/deny controls appear; editing it requires another check. The CLI opens `verification_uri` in the default browser rather than using a prefilled URL, and prints a fallback link if browser launch is unavailable. CLI logout confirms bearer rejection before removing its local credential; uncertain revocation remains retryable. Expired/denied login shows a retry instruction.

Store the CLI credential in an OS-appropriate user config directory with restrictive file permissions, outside the repository. Logout revokes the server session and removes the local credential. Server checks ownership of every review, inference session, presence ticket, and note request; browser sessions do not grant another account's data. Validate plugin compatibility and session-token handling before building the other CLI endpoints. [Better Auth Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Device authorization](https://better-auth.com/docs/plugins/device-authorization), [Bearer sessions](https://better-auth.com/docs/plugins/bearer).

### WebSocket Presence Service

Implements `prd.md > Arrival and Setup` and connection status.

Standalone Node/ws service on Railway. The CLI authenticates its persistent connection; the browser obtains a short-lived, one-use WebSocket ticket through its authenticated HTTP session so long-lived credentials are not embedded in URLs. Server scopes subscriptions to the account and validates browser origin.

Events: `cli.connected`, `cli.disconnected`, and `presence.snapshot`, with device ID and timestamp. Heartbeats every fifteen seconds; after forty-five seconds without a heartbeat report disconnected. Reconnect with capped exponential backoff and refresh expired tickets. Ticket issuance stores only its hash, owner, and expiry in Neon. The connection service atomically consumes and deletes the matching ticket, so it cannot be reused across processes. Revalidate the CLI session at each heartbeat and close revoked sessions; temporary account-service failures use retryable closure rather than a revoked-session signal; logout also sends a best-effort authenticated internal disconnect request to the connection service. A missed disconnect request is bounded by heartbeat revalidation. The service reports only presence, not uploads or arbitrary local commands. The connected checklist transition is driven by this state. No remote code execution from the website.

### Upload API and Job Dispatch

Implements `prd.md > Submission Eligibility`, `prd.md > AI Preparation and Recommended Review Order`, and `prd.md > States and Boundaries`.

Server verifies ownership, protocol, payload bounds, file hashes, line counts, and eligibility. Persist the snapshot before dispatching a Trigger.dev task. Task payload contains IDs, not a giant code archive. An idempotent request ID prevents duplicate uploads; retrying job dispatch is safe. Record dispatch failure so the UI can retry it. Persist an attempt number; task idempotency keys are reviewId:generation:attempt. Redelivery of an attempt reuses its key, while an intentional retry after terminal failure increments the attempt and gets a new key. Enforce attempt/generation checks on publication and retry requests.

### Review Preparation Task

Implements `prd.md > AI Preparation and Recommended Review Order`.

`prepare-review` loads the saved snapshot and context map. Preparation is a bounded multi-pass job, not a single model call over the whole upload: split files into line-addressed windows, map relevant context into each window, request structured section/relationship results, validate per-window coverage, and aggregate deterministically. Use a compact cross-file grouping pass over definitions and relationships; if that graph is too large, partition and merge summaries by original IDs. OpenRouter returns structured file sections, relationship edges, groups, and proposed order. Proposed per-call targets are at most 16,000 input tokens and 4,000 output tokens, reduced to fit the configured model; stage results and usage so retries can resume completed batches. Never truncate selected source to make one call fit. Validate against shared schemas and actual file ranges. Verify coverage of every changed line and every selected file; reject hallucinated paths, overlapping invalid ranges, or missing changes. Retry bounded repair before showing an analysis failure; do not publish an incomplete review as success.

Section records reference exact old/new source spans; summaries never replace source text. The application computes a deterministic dependency-first order from validated relationship edges. Section cycles and mutually dependent files become an explicit related group with a stable internal order, rather than claiming a dependency order exists. The flat file order is a best-effort projection of the validated section graph; explain relationships that cannot all be satisfied by one file ordering. Return explanations of the proposed order without claiming language-independent static-analysis certainty.

Publish only if the job's generation still matches the review's pending generation. An outdated job cannot overwrite a newer sync. [Trigger task dispatch](https://trigger.dev/docs/triggering), [OpenRouter structured output](https://openrouter.ai/docs/guides/features/structured-outputs).

### Review Workspace and Diff Renderer

Implements `prd.md > Review Workspace`, `prd.md > Code Navigation and Diff Views`, and `prd.md > Completion and Buddy Feedback`.

A client workspace reads an authenticated review view-model, renders ordered collapsible groups and file search, and uses resizable sidebars. Render exact stored source and diff data with line-numbered selections. Split and full-file views derive from the same old/new mapping; deletions remain inspectable. Sections expand to full surrounding source. Previous/Next use flattened recommended file order; end buttons disable appropriately.

Marking a file complete sets its current sections complete; the file is complete only if every required section is complete. Group completion derives from file completion. Celebrate the transition to completed, not every page refresh. Progress saves with optimistic updates and rolls back on failed persistence.

### Inline Explanation Service

Implements `prd.md > Inline Explanations`.

Validate file, generation, side, and selected line span. Build token-bounded context from the exact selection first, then its enclosing section and the most relevant definition references and summary. Reserve output capacity and disclose insufficient context rather than inventing missing definitions; request the explanation role through OpenRouter. Stream text to an anchored, dismissible bubble with loading/retry states. Cancel or disregard responses when the user switches selection or generation. Treat code/comments as source material rather than instructions to the model. Plain text output must not execute HTML.

### Notes and Prompt Formatter

Implements `prd.md > Notes and Follow-up Prompt`.

Save notes with original path, old/new side, generation, selected line range and exact selected code if present, message, and associated section. Notes may be file-level when no code is selected. On continue sync, retain original references even if the section vanishes; identify outdated references rather than falsely attaching them elsewhere.

Generate the final prompt from stored source-selection details and all user notes in deterministic order. Clearly identify original snapshot references that may need locating in newer code. No notes yields a completed-review message and a neutral completion prompt without invented requests. Copy uses the browser clipboard with a selectable-text fallback.

### Continue Sync and Full Reset

Implements `prd.md > Saved Reviews and Sync Modes`.

Sync always uploads a complete replacement snapshot of the chosen source; continue is a progress-merging mode, not blindly appending a patch. Reject an ineligible candidate before changing the active review. Allow only one pending sync per review; mutations carry the expected generation and reject stale writes.

Continue: retain the previous prepared review during analysis; match sections using normalized file identities, exact content hashes, and uniquely matching surrounding context. Preserve completion only for confident matches. Changed or ambiguous sections are incomplete. Group labels from AI are not stable IDs. Keep all notes, including ones with no surviving section. Publish matched state atomically after successful preparation.

Full: warn explicitly that notes and progress will be cleared. CLI must display the warning and require typed confirmation; the website explains the same consequence in sync guidance. The reset payload includes current generation and an explicit reset acknowledgment. After confirmation, keep the existing review visible but read-only while full-sync preparation is pending; reject note/progress mutations server-side and display why editing is paused. Analyze first, then atomically replace the active review and clear notes/progress after success. Failure or cancellation releases the edit lock and retains the existing notes/progress; a canceled task cannot later publish. A failed full-sync candidate leaves the existing review intact. Previous snapshots needed during processing are transient implementation data, not user-facing review history; delete them once no active task or note needs them.

### Preferences, Buddy, and Loading/Error States

Implements `prd.md > Look and Feel`, `prd.md > Completion and Buddy Feedback`, and `prd.md > States and Boundaries`.

Persist theme, code font, diff mode, panel widths, and last selected file per user/review. CSS-animated buddy supports idle, encouragement, loading, group celebration, and error reactions. Error messages explain actionable cause and offer retry; cheerful styling must not obscure an error. Account, content, and progress remain available after disconnect; disconnect is not a logout or reset.

## Data Model

All authoritative cloud state lives in Neon Postgres, managed through Drizzle migrations. Use Better Auth's generated auth tables plus these application entities:

| Entity            | Stored fields and update behavior                                                                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| devices           | Account/session link, display name, last connection; revocation invalidates API access. Live socket membership lives in the connection service, not as a permanent connected boolean.                |
| reviews           | Owner, source descriptor, active/pending generation, status, run ID, attempt number, full-reset edit lock, dispatch/error state, last-view preferences. Updated under a per-review transaction lock. |
| snapshots         | Immutable before/after file manifest, diff metadata, context summary, hashes, source revisions, preparation state. JSONB stores bounded manifests initially; no extra object-storage service.        |
| sections          | Snapshot/file identity, old/new spans, content hash, validated relationships and ordering metadata, completion state.                                                                                |
| notes             | Review/owner, original snapshot/file/selection/message, optional current section link; survive continue, clear on successful full reset.                                                             |
| userPreferences   | Theme, code font, preferred diff mode; account-scoped.                                                                                                                                               |
| inferenceSessions | Owner, source ID, expiry, request/token usage counters and remaining budget; created before local agent inference.                                                                                   |
| connectionTickets | Hashed short-lived browser ticket, owner, expiry; consumed atomically by the separate connection service.                                                                                            |

Groups and validated dependency maps are saved in the prepared snapshot; file/group completion is derived. A reload reads cloud data. Browser selection and unfinished tooltip state are ephemeral. Note drafts stay locally until saved, and the UI makes save failures visible. Logs record IDs, timings, and provider usage without dumping source, credentials, or full prompts.

## File Structure

Planned conversion of the current starter; do not move existing files during this planning step.

```text
senslop/
├── apps/
│   ├── web/
│   │   ├── src/app/
│   │   │   ├── page.tsx                    # landing page
│   │   │   ├── (auth)/                     # signup/login
│   │   │   ├── device/page.tsx             # CLI approval
│   │   │   ├── dashboard/page.tsx          # checklist/connected empty state
│   │   │   ├── reviews/[id]/page.tsx       # workspace
│   │   │   └── api/                       # contracts listed below
│   │   ├── src/components/
│   │   │   └── ui/                        # shadcn primitives
│   │   ├── src/lib/auth/                  # auth.ts and auth-client.ts
│   │   ├── src/data/env/                  # typed T3 server/client variables
│   │   ├── src/features/                  # connection and review resources
│   │   ├── src/services/trigger/          # durable preparation task
│   │   ├── src/global.css                # semantic theme colors
│   │   ├── trigger.config.ts
│   │   ├── public/
│   │   └── package.json
│   └── connection-server/
│       ├── src/index.ts                   # ws and health endpoint
│       ├── src/presence.ts                # heartbeat/reconnect events
│       └── package.json
├── packages/
│   ├── cli/
│   │   ├── src/index.ts                   # argument parsing/exit codes
│   │   ├── src/features/                  # auth, connection, git, review, sync
│   │   ├── src/services/ai/               # repository tools, parent/subagents
│   │   ├── src/lib/                       # shared HTTP and utilities
│   │   ├── src/data/env/                  # typed operating-system configuration
│   │   ├── dist/                          # compiled publishable CLI output
│   │   └── package.json                   # bin, files, engines, release scripts
│   ├── contracts/src/                     # protocol and Zod validators
│   ├── database/
│   │   ├── src/schema/                    # Better Auth and app schema
│   │   ├── src/client.ts                  # single server-only db export
│   │   ├── migrations/
│   │   └── drizzle.config.ts
│   └── review-core/src/                   # coverage, ordering, matching, prompt
├── vitest.config.mts                      # behavioral test runner
├── tests/fixtures/                        # eligible multilingual Git examples
├── devpost/                               # canonical learning/planning docs
├── .env.example                           # names only, no secrets
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── turbo.json
└── package.json                           # root dev/build/test/migration commands
```

## HTTP and WebSocket Contracts

All routes are proposed Senslop interfaces, not claims about external providers. Shared schemas are canonical; JSON examples describe essential fields.

| Endpoint                                  | Input and response                                                                                                                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/*`                             | Better Auth handlers; browser session and device endpoints mounted here. First-party device flow uses `/device/code`, `/device/token`, approve and deny handlers through the configured auth client.             |
| `POST /api/inference/sessions`            | CLI credential; source identity and manifest counts → session ID, allowed model roles, remaining bounds.                                                                                                         |
| `POST /api/inference/v1/chat/completions` | CLI credential plus owned inference-session ID; role alias, messages, tool definitions, streaming flag → OpenAI-compatible completion/tool calls or SSE.                                                         |
| `POST /api/reviews`                       | CLI credential; request ID, protocol version, source descriptor, files, hashes, context map → review ID, pending generation, status and website URL. Returns 422 for ineligible content, 413 for excessive size. |
| `GET /api/reviews/:id`                    | Browser/CLI authentication → status, active generation, prepared view-model and error details.                                                                                                                   |
| `POST /api/reviews/:id/retry`             | Expected generation → redispatched analysis state; reuse saved snapshot, not another upload.                                                                                                                     |
| `PATCH /api/reviews/:id/progress`         | File/section IDs, completed value, expected generation → saved progress; 409 on stale generation.                                                                                                                |
| `POST /api/reviews/:id/notes`             | Expected generation, file identity, optional side/range/selected code, message → saved note.                                                                                                                     |
| `POST /api/reviews/:id/explain`           | Generation, file identity, side and selected span → streamed text; request can be canceled.                                                                                                                      |
| `GET /api/reviews/:id/prompt`             | Owned completed review → formatted prompt; incomplete review returns a clear state error.                                                                                                                        |
| `POST /api/reviews/:id/sync`              | New upload manifest, mode, expected generation, reset acknowledgment if full → pending generation/job state.                                                                                                     |
| `PATCH /api/preferences`                  | Validated appearance and layout settings → saved preferences.                                                                                                                                                    |
| `POST /api/connection-ticket`             | Browser session → one-use ticket and websocket URL, short expiry.                                                                                                                                                |
| `WSS /connection`                         | CLI session header or browser one-use ticket → account-scoped presence events and heartbeat exchange.                                                                                                            |

Consistent error shape: `{code, message, retryable, details}`. Internal provider errors and secrets are not returned verbatim. Upload retries use the same request ID; a deliberate new upload uses a new ID. Inference session quotas prevent a public unlimited provider-key proxy.

## External Services and Dependencies

- **Neon:** Runtime pooled `DATABASE_URL`, direct `DATABASE_URL_UNPOOLED` for Drizzle migrations. Build on an isolated dev branch; apply generated migrations there first. SQL stores auth, snapshots, notes, and progress. [Neon docs](https://neon.com/docs/llms.txt), [Drizzle](https://orm.drizzle.team/docs/connect-neon).
- **Better Auth:** Self-hosted Next.js handlers with `BETTER_AUTH_SECRET` and website base URL; Drizzle adapter, device authorization plugin, and bearer session support. Validate the current plugin's session token contract during the first vertical slice. [Auth installation](https://better-auth.com/docs/installation), [Device flow](https://better-auth.com/docs/plugins/device-authorization).
- **OpenRouter:** Server POST to `https://openrouter.ai/api/v1/chat/completions` using a bearer `OPENROUTER_API_KEY`; request contains configured model ID, messages, tools or response-format schema, streaming choice, and output limits. Response is chat completions or SSE. Configured provider availability, tools, structured outputs, limits, and pricing must be verified for the chosen model IDs; no price or free-tier assumption is made. [API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request), [Structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
- **Trigger.dev:** Backend `tasks.trigger('prepare-review', {reviewId, snapshotId, generation, attempt}, {idempotencyKey})` using `TRIGGER_SECRET_KEY`. Handle returns a run ID; the task reads/writes Neon and uses the server OpenRouter key. Browser reads Senslop's persisted status initially, avoiding a second live-update system. [Task triggering](https://trigger.dev/docs/triggering).
- **Railway:** Two long-running Node services, HTTPS/WSS public domains, service health checks and restart-aware presence. Configure app base URL, connection URL, auth origins, and service secrets. [Deployment](https://docs.railway.com/guides/nextjs), [Realtime transport](https://docs.railway.com/guides/sse-vs-websockets).
- **npm:** Public CLI package with `bin: {senslop: './dist/index.js'}`, a Node shebang, explicit files allowlist, engine requirement, README and license. Package name/scope is a placeholder until availability and ownership are checked. [Executable packages](https://docs.npmjs.com/cli/v7/configuring-npm/package-json/), [Publishing](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages/).
- **pnpm/Turborepo:** Link internal dependencies through workspace declarations. Build shared packages before consumers; cache build/test outputs but not credentials or agent requests. [Workspaces](https://github.com/pnpm/pnpm.io/blob/main/docs/workspaces.md), [Internal packages](https://turborepo.dev/docs/core-concepts/internal-packages).

Service prices, actual plan quotas, account access, npm name ownership, and chosen model costs are unverified. Confirm them before provisioning or public release. Website, task worker, and connection server each receive only the credentials they require; no environment file is included in the npm archive.

## CLI Packaging and Learning Checkpoints

The learner has not built a CLI or published an npm package before. The key distinction explained in the interview: the CLI runs locally, npm distributes its executable, Railway runs the remote services, pnpm links shared code, and Turborepo orders/caches work.

1. Build a help/status command and explain argument parsing, stdout/stderr, exit codes, and the Node shebang using its actual code.
2. Build CLI JavaScript and bundle the contracts/review-core code it needs. Do not publish server/database packages or depend on unresolved workspace-only modules.
3. Run `npm pack --dry-run` in `packages/cli` to inspect included files, then `npm pack` to create the archive.
4. Install that archive into a clean temporary environment outside the monorepo and verify help, login, Git selection, upload, and sync. It must work without workspace symlinks.
5. Choose an available npm name/scope, update installation instructions, and authenticate through npm's publishing flow. Release only after package contents and clean installation pass. Public publication is a later release step, not part of writing this spec.

Root planned commands: `pnpm build`, `pnpm test`, `pnpm --filter @senslop/cli build`, and `pnpm --filter @senslop/cli pack:check`. Workspace name is internal; public npm name remains undecided. [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/).

## Verification Approach

- Unit/integration tests for commit/range/working-tree snapshots, added/deleted/renamed files, additions-plus-deletions counts, eligibility with smaller files, and exact selection coordinates.
- Deterministic tests for source coverage, invalid AI sections, dependency cycles, duplicate request IDs, distinct intentional retry attempts, stale job publication, one-use ticket consumption across processes, token-bounded preparation batches, and conservative sync matching. Notes remain intact through continue; failed/canceled full sync leaves existing data intact; confirmed successful full sync clears it and disallows edits during preparation.
- Auth tests show a second account cannot read or mutate a review or use another account's inference session. Revoked credentials fail both HTTP and presence.
- Browser walkthrough covers checklist transition, preparation/retry, all three panels, diff modes, search, tooltip, notes, resume, group celebration, preferences, and copyable prompt.
- Live end-to-end check with a real eligible multilingual fixture exercises local tool calls through the authenticated proxy and Trigger.dev preparation. Fixtures are labeled; do not substitute fake AI results for this core proof.
- Clean-archive installation proves CLI distribution. Build/typecheck/lint run across changed workspace packages. Review actual language quality on representative TypeScript, Python, and compiled-language changes; language-independent architecture is not a guarantee of equal explanation quality everywhere.

## Important Failure Modes

- Local snapshot/context scan fails or reaches a configured bound: CLI explains cause; no partial upload or silently omitted selected code.
- Provider/tool calling or review JSON fails: bounded retries, then a retryable error; retain saved input and any previous active review.
- Socket drops or Railway restarts: connection indicator updates and CLI reconnects; stored notes/progress remain in Neon.
- Sync races with edits/jobs: generation checks reject stale writes and prevent outdated tasks from overwriting newer review state.
- Note persistence fails: preserve the visible draft and show failed save instead of claiming success.

## What Was Simplified and Why

Manual local uploads, no GitHub integration, no automatic push triggers, no agent-directed fixes, and no autonomous bug review follow the approved scope. A language-independent AI pass avoids a parser per language; deterministic coverage checks protect exact change visibility. One connection-service replica and browser status polling avoid additional pub/sub infrastructure. Bounded JSONB snapshots avoid adding object storage for the first version. Notes-to-prompt formatting is deterministic rather than another paid model call. These implementation proposals retain the core idea; resource bounds and binary handling are explicit limitations for review.

## Decisions and Open Issues

### Agreed With the Learner

All named services, Railway hosting direction, persistent WebSocket presence with HTTPS commands/uploads, local AI SDK context agents/subagents, Senslop-funded inference through an authenticated proxy, browser-approved revocable CLI login, language-independent review, conservative progress matching, and pnpm/Turborepo sharing were discussed and accepted. Product behavior remains governed by the approved PRD.

### Defaults Approved During Technical Review

Email/password sign-in default; the CLI Git source/counting semantics; binary metadata-only handling; proposed resource bounds; one connection-service replica; pg driver and JSONB snapshots; theme/font defaults; and token-bounded preparation, and atomic publish-after-success with a read-only workspace during full-sync preparation. These defaults were proposed in the technical draft and accepted when the learner approved the displayed plan. Discovered compatibility limitations must still be surfaced before implementation.

### Genuine Learning Unknown

The learner asked how to build and publish a CLI and whether a monorepo is needed. The explanation distinguished execution, packaging, distribution, and workspace/build coordination. The accepted structure and archive/install checkpoints above turn that into practice. Understanding or mastery has not been assessed.

### Checks Before the First Live Build

Confirm service account access and environment setup; verify installed Next.js guides, mutually compatible AI SDK/provider and Better Auth/plugin versions, Railway runtime, Trigger.dev monorepo task build, and model tool/schema support. Select live model IDs and reasonable operator budgets; the environment must fail clearly if these are absent. Verify costs and quotas rather than assuming free usage. Confirm that the device session works for authenticated CLI headers before expanding endpoints.

Exact npm public name and theme palette tuning can wait until package-release and visual checkpoints. If limits prevent an intended codebase from being reviewed, surface the limitation rather than weakening coverage or falsely claiming success.
