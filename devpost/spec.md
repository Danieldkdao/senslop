---
doc: spec
status: approved
last-reconciled: 2026-10-24
implementation-baseline: 0860767
---

# Senslop — Current Technical Specification

## Purpose and source of truth

This specification describes the existing local application at the recorded baseline. It replaces the superseded cloud-upload/managed-inference design previously mixed into this file.

Read [scope.md](scope.md) for the boundary, [prd.md](prd.md) for behavior, and [local-review-roadmap.md](local-review-roadmap.md) for proposed features and future implementation handoff. The roadmap does not mean its features are implemented. Recheck code and installed package versions before extending this baseline.

The recorded commit is the foundation. Feature 1 was implemented on October 24, 2026 and updates the behavior below; completion notifications remain deferred. Its implementation commits and verification evidence are recorded in the roadmap progress record.

## Architecture

`packages/cli` launches a protected loopback Next.js app from `apps/local` and a local Inngest engine. Short CLI clients discover the app through a private per-workspace session record. Browser and CLI operations share the local APIs and services.

Git capture/persistence live in `packages/review-core`; Zod contracts live in `packages/contracts`; shared UI lives in `packages/ui`. The local app stores reviews, frozen context, notes, preferences, jobs, and conversations in per-user SQLite. API keys and subscription credentials use OS credential storage.

Configured models execute through direct provider adapters, compatible endpoints, local servers, or subscription integrations. Senslop does not relay local review source through a hosted inference proxy. A remote provider can still receive source from the local process.

Separate hosted auth/presence applications remain in the monorepo. They are not the local workspace's database, job engine, or source transport.

## Installed stack at the baseline

| Area                     | Current implementation                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Runtime/toolchain        | Node.js 24.x or 26+, pnpm 12.8.1, TypeScript 5.9.3, Turborepo 2.11.7                   |
| Local/hosted UI          | Next.js 16.3.8, React 19.2.8, Tailwind, shared shadcn/Base UI components               |
| Diffs                    | @pierre/diffs 1.5.2 and syntax-highlighting support                                    |
| Forms/validation         | React Hook Form, Zod resolvers, shared Zod contracts                                   |
| Client state             | TanStack Query; React Pacer for history search debounce                                |
| Shortcuts                | @tanstack/react-hotkeys 0.16.0 and core @tanstack/hotkeys 0.17.0 through a shared hook |
| AI                       | AI SDK 7.0.137, provider adapters, Claude integration, and subscription services       |
| Jobs                     | Inngest SDK 4.23.0 with bundled local Inngest CLI engine                               |
| Git/analysis             | simple-git, diff, TypeScript compiler, dependency-cruiser                              |
| Local database           | Node's DatabaseSync SQLite with explicit migrations; no local Drizzle adapter          |
| Credentials              | @napi-rs/keyring through the shared OS credential service                              |
| Verification             | Vitest, Testing Library, TypeScript, ESLint, Prettier                                  |
| Separate hosted services | Better Auth, Drizzle/Neon Postgres, Mailjet, and Express/ws presence                   |

Package manifests and the lockfile are the authority for exact versions. Generated framework guidance in `AGENTS.md` requires reading installed documentation before relevant changes.

## Workspace ownership, ports, and discovery

Relevant modules: [launcher](../packages/cli/src/features/workspace/local-app.ts), [engine/ports](../packages/cli/src/features/workspace/local-jobs.ts), [runtime paths](../packages/cli/src/features/workspace/runtime-paths.ts), [session records](../packages/cli/src/features/workspace/workspace-session.ts), and [client](../packages/cli/src/features/workspace/workspace-client.ts).

1. Resolve the real Git working-tree top level; retain the effective launch directory separately.
2. Locate per-user app data, optionally overridden by an absolute `SENSLOP_DATA_DIRECTORY`.
3. Hash the resolved root into a per-repository jobs/state directory. Ownership is scoped to that root and data namespace, not globally to every possible installation.
4. Claim ownership through a per-workspace SQLite transaction, retaining a token and PID plus a legacy-compatible owner.lock. One simultaneous launcher wins; stale state is replaced only when its owner is dead. Repeated CLI startup authenticates and reuses the published owner, including waiting for a concurrent winner to finish startup.
5. Reuse an available saved port. If an unrelated process occupies it while there is no owner, allocate and persist another port.
6. Start the local engine and Next.js child with explicitly selected environment variables and separate session/worker capabilities.
7. Verify readiness, register the job endpoint, and atomically publish a private session descriptor.
8. Clients read the descriptor and verify an authenticated health response with a matching session header before issuing requests.

The app binds to 127.0.0.1. Session files are private and atomically replaced under the same workspace-state transaction used for removal; old-owner cleanup checks identity before removing a replacement session. Owner release also compares the ownership token, so an old cleanup cannot remove a replacement lock. Child supervisors/parent monitoring tie engine and app lifetimes to their owner.

Stopping an ordinary client does not stop the app. Stopping the owner stops execution and removes disposable session/transport state while retaining durable records. Pending job recovery occurs when the app resumes; there is no independent always-running daemon.

## Identity and data flow

- A saved review's UUID is its public review/snapshot ID.
- Hash, round, source revisions, and repository identity identify captured content.
- Keep-mode re-sync retains the ID and advances its round; new mode creates another review.
- AI jobs have their own UUID, task kind, generation, captured round/hash/settings, state, and optional worker-engine run ID. CLI `runs` commands address the job UUID, not the engine's internal execution ID.
- One shared default review remains persisted per repository for `current` and initial tab entry. Background capture activates only the first saved review; explicit activation remains available. Each browser tab pins its review through `?review=ID` and polls that ID. Per-tab selected paths are retained in session storage and overlaid on durable shared selection.
- `current` is a mutable convenience lookup. Concurrent automation should retain explicit IDs.
- CLI discovery retains the effective caller folder separately from the canonical Git root. Capture sends and validates that folder against the workspace. Browser capture uses the owner folder; keep-mode re-sync retains its original folder.
- Mutation paths use captured hash/round expectations where implemented to reject stale operations. Results are associated with their originating revision rather than the latest selected UI row.

Feature 1 implements background capture, independent reading views, caller-folder context, persisted list status, queue controls, recovery, and shared capacity. Completion notifications are explicitly deferred. CLI/browser bootstrap URLs carry review and optional file selection privately; returned public locations omit session capabilities.

## Git capture and bounds

The CLI and browser share the [Git collector](../packages/review-core/src/features/git/repository.ts) and [snapshot implementation](../packages/review-core/src/features/git/snapshot.ts).

Supported sources are working tree, single-commit first-parent delta, validated endpoint range, and local branch comparison with an optional base. Read operations do not fetch, pull, check out, or mutate repository state.

Captured files retain repository-relative path, original path where applicable, status, before/after text and hashes, diff, and binary metadata. Source identities and fingerprints detect changes around capture and re-sync. Filesystem handling enforces path/realpath boundaries and secret exclusions.

Current contract/capture bounds include a 1 MiB limit for selected text file contents, a 20 MiB serialized snapshot including metadata/diffs, and at most 2,000 files. Refer to implementation constants for exact enforcement and captured-context limits. Oversized selections fail explicitly rather than silently truncating review content. Binary contents are not provided as text to analysis.

Ordinary saved-review inspection accepts small changes. Legacy standalone `inspect ... --json` still reports eligibility using five nonbinary files with at least ten changed lines each and may exit 2; this is not a local review admission requirement.

## Persistence and migrations

The [LocalStore](../packages/review-core/src/db/local-store.ts) uses SQLite WAL, a busy timeout, foreign keys, explicit transactions, and restrictive filesystem permissions. The current user_version is 4; newer unsupported data versions are rejected.

| Table                | Responsibility                                                                      |
| -------------------- | ----------------------------------------------------------------------------------- |
| reviews              | Repository-keyed saved review JSON, source, round, notes, completion, and selection |
| active_reviews       | Current review ID for a repository                                                  |
| connections          | Nonsecret provider connection metadata                                              |
| preferences          | Saved application/review/AI settings by preference key                              |
| credential_cleanup   | Pending OS credential cleanup                                                       |
| ai_jobs              | Grouping/correctness jobs and saved output                                          |
| ai_conversations     | Snapshot chat history                                                               |
| ai_context           | Captured source, static analysis cache, and incremental grouping context            |
| ai_batch_checkpoints | Resumable analysis batch output by job/checkpoint                                   |

Local settings and provider metadata are stored in shared per-user data; do not assume every preference has a per-project scope. Repository isolation is enforced for review reads/writes. Deleting a review cascades associated job/context/conversation records through the implemented persistence paths.

History summaries expose recorded directory or null for legacy data. Search uses literal, case-insensitive name/directory matching scoped by repository. No launch-folder schema migration was required because metadata lives in review JSON.

## Workspace service and re-sync

[LocalWorkspace](../apps/local/src/features/workspace/lib/local-workspace.ts) coordinates repository reads, inspection, captured context, CLI handoff ingestion, and re-sync. [Server workspace](../apps/local/src/features/workspace/lib/server-workspace.ts) constructs it from typed runtime exports.

An eligible re-sync identifies the saved working-tree review by ID and expected hash/round with captured branch/HEAD, independently of global selection. A workspace operation queue serializes capture/re-sync; persistence rechecks expected identity before publishing. Keep mode updates the same ID, carries original references/notes, retains unchanged-file completion, and preserves the original directory. New mode saves a newer-edits review while retaining the older review. Changed branch/HEAD requires a new review.

[Note anchoring](../packages/review-core/src/features/history/note-anchors.ts) retains/remaps exact excerpts where unambiguous; original note context is not replaced with unrelated live source. Superseded jobs cannot publish over the current round. Prior correctness output remains historical; no automatic finding lifecycle is inferred.

## Frozen context and analysis

[Context capture](../apps/local/src/services/analysis/frozen-context.ts) stores a bounded source view for the captured snapshot. [Snapshot analysis](../apps/local/src/services/analysis/snapshot-analysis.ts), [frozen compiler](../apps/local/src/services/analysis/frozen-compiler.ts), and workspace package resolution produce symbols, references, dependencies, cycles, diagnostics, and related-test information where available.

Read-only tools list/read/search frozen source and expose that analysis. Before/after reads keep the captured sides distinct. JavaScript/TypeScript receives compiler-backed support; arbitrary languages do not have equivalent semantic coverage.

Diagnostics use captured configurations and available source. External declaration files, generated project-reference outputs, unresolved dependencies, bounded context, and dynamic runtime behavior limit conclusions. No project test/build process is executed by these source tools.

## AI task pipeline

[Agent schemas](../apps/local/src/features/agents/schemas.ts), [repository agent](../apps/local/src/services/ai/repository-agent.ts), [structured analysis](../apps/local/src/services/ai/structured-analysis.ts), and [validation](../apps/local/src/features/agents/lib/validate-results.ts) define the analysis boundary.

- AI settings select a shared task model or separate Grouping, Context, Review, and Explain assignments. Grouping mode defaults to never; instructions and connection capacities are configurable.
- Jobs snapshot settings when created. A context agent can retrieve supporting source for analysis rather than relying solely on changed lines.
- Large work is budgeted and batched, with persisted checkpoints and bounded format/coverage repair. Incremental grouping can reuse previous round context.
- Grouping covers each selected file once with rationale, summaries, related paths, and order. The model contract expresses prerequisite-first/test-last intent; validation verifies coverage and paths rather than proving semantic ordering.
- Correctness findings require supported severity and exact evidence matching frozen selected change locations. Invalid or incomplete output fails or follows the implemented bounded repair path.
- Combined and per-finding fix prompts include location/context and ask the downstream agent to evaluate validity before fixing.
- Chat and explanations stream through their dedicated endpoints and persist supported conversation states. Their model choices are distinct from assigning every background task role.
- Adapter behavior follows configured capabilities for tools, structured output, context/output limits, and subscription routing.

Generation/round/hash checks prevent stale writes. Analysis limits are recorded explicitly; evidence validation and successful model output do not certify code correctness.

## Job engine and capacity

[Dispatch](../apps/local/src/services/inngest/functions.ts), [execution](../apps/local/src/services/inngest/jobs.ts), and [AgentStore](../apps/local/src/features/agents/lib/agent-store.ts) provide queued/running/completed/failed/canceled state, dispatch identity, cancellation events, retry/recovery, saved histories, and active matching-job reuse.

The analysis function currently limits active execution to two slots and to one slot per snapshot/task kind. These are Inngest execution-step limits. [Provider request limiting](../apps/local/src/services/ai/request-limiter.ts) separately controls concurrent/budgeted model calls and adapts to configured capacity.

The existing adaptive process limiter is layered with a shared SQLite admission coordinator in ai-capacity.sqlite beside reviews.sqlite. It tracks queued requests, active slots, process IDs, and one-minute input/output/request reservations, using transactions across repository processes in that data namespace. Matching endpoint/account hashes share capacity without persisting credentials. A total machineConcurrency ceiling defaults to four, and active captured policies use the strictest applicable ceiling. Streaming retains admission through consumption/cancellation. Nested native-context requests reuse the parent slot while reserving their own quota. Dead process slots are reclaimed; usage reservations remain conservative until expiry. Separate data directories and outside clients are independent. Capacity preference changes, including the total ceiling, are rejected while queued/running saved jobs exist. Waiting clients time out without deleting jobs.

Grouping preparation retains terminal fallback to original files. History projects the latest persisted job for each kind and exact review revision without returning model settings or result bodies. Readability and optional correctness state remain separate. Queued priority changes invalidate the previous dispatch and send a replacement with a bounded 120-second scheduling preference. Retries link through retryOf and preserve captured settings/revision/priority. Batch checkpoints are reused only within that retry lineage; an intentional completed-run re-analysis starts fresh. Dispatch generation plus owner-start identity reject old execution after reprioritization or restart. Existing active-view activity feedback is retained; background completion notifications are deferred.

## Local API boundaries

These Next.js routes implement the current local surface; consult their request schemas for exact methods and payloads.

| Route                                        | Responsibility                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| /api/health, /api/session                    | Authenticated discovery/readiness and browser session handoff                           |
| /api/preview                                 | Current saved preview and legacy CLI transport handoff                                  |
| /api/workspace                               | Repository metadata, history/search, inspect/open/change/re-sync operations             |
| /api/workspace/updates                       | Revision polling for external CLI writes                                                |
| /api/agents                                  | Jobs/results, history, conversation/run mutations, cancellation, and fix-prompt exports |
| /api/agents/chat, /api/agents/explain        | Snapshot chat/explanation streaming                                                     |
| /api/agents/settings                         | AI settings reads and validated updates                                                 |
| /api/ai-test                                 | Provider/model chat testing                                                             |
| /api/providers, /api/providers/models        | Connection operations and model metadata                                                |
| /api/providers/subscriptions                 | Subscription sign-in/status/cancel/sign-out                                             |
| /api/review-preferences, /api/ui-preferences | Persisted review and UI configuration                                                   |
| /api/inngest                                 | Local worker endpoint and registration                                                  |

Session/capability and origin checks protect local operations. Browser APIs expose configured credential state, not saved secrets. The worker uses its distinct runtime capability/signing configuration. Do not expose capability-bearing URLs as public project links.

## Browser state, UI, and shortcuts

TanStack Query owns resource queries/mutations. History uses a 250 ms Pacer debounce. A local workspace revision poll invalidates affected queries after external CLI operations. Preview polling uses the tab's pinned review ID, retaining immutable file objects on metadata updates. Browser actions apply the returned review only to their provider; background creation and another client's shared-default selection do not navigate existing tabs. History polls while open and preserves rows during refresh, including queued controls and rename drafts. Snapshot and job status icons share the title row with rename/delete controls; full status details and icon actions have hover/focus tooltips and accessible labels.

The diff workspace composes files/notes, central canvas, and Agents panels with responsive drawers. Persisted UI preferences include application/editor themes, fonts, view/options, panel sizes, and buddy configuration. Pending preference mutations overlay confirmed data to avoid older responses undoing newer input.

Settings use reusable section/screen definitions, breadcrumbs, and optional headerActions. The header parent uses `flex items-center gap-2 min-w-0`, title wrapper `flex-1 min-w-0`, and actions wrapper `shrink-0`. Provider navigation from AI settings passes the full section so those actions remain.

[useKeyboardShortcuts](../packages/ui/src/hooks/use-keyboard-shortcuts.ts) wraps TanStack registration, shared/per-binding options, repeat/overlay policy, and an unmount AbortSignal. Native `ignoreInputs: true` supplies input filtering, including shadow inputs. Accepted events apply configured preventDefault/propagation behavior. K opens file search; D completes; arrows navigate; R/brackets handle saved history; the shared sidebar uses Mod+B.

Do not restore the removed custom text-input detector. [Hotkey research](tanstack-hotkeys-input-research.md) records version-specific behavior.

## Providers, subscriptions, and credentials

[Provider contracts](../packages/contracts/src/providers.ts) define remote APIs, local providers, custom OpenAI-compatible models, and ChatGPT/Claude subscription connections. Model metadata/discovery and custom capability configuration are implemented; model choice is not deferred.

Metadata-only connection tests preserve configuration even when verification fails. Their result persists through provider refresh, with retry using saved credentials. Public catalogs or unsupported probes do not prove authenticated inference availability.

Subscription sign-in uses the implemented provider-specific flows, request status/cancellation, account/catalog checks, and refresh/re-authorization handling. Presence of adapters and fixture coverage does not establish every account's eligibility or a universal provider availability guarantee.

OS Keychain/Credential Manager/Secret Service stores secrets. SQLite stores nonsecret metadata and cleanup work. A locked/unavailable credential store fails rather than falling back to plaintext. Runtime environment reads flow through typed exports except documented launcher/tooling requirements.

## CLI and agent skill

[Command catalog](../packages/cli/src/features/commands/definitions.ts) drives help and accepted options. [CLI README](../packages/cli/README.md) documents current commands.

- App lifecycle is separate from short review/provider/settings commands.
- Reads leave browser selection alone. Creation returns after capture/scheduling unless --wait, opens only the first review by default, and honors explicit --open. reviews open launches a review-specific tab; select saves a path and opens it only with --open. Follow-up review commands accept paired expected hash/round flags. Revision conflicts use recoverable HTTP 409 and CLI exit 6. runs list --all and runs prioritize expose workspace queue controls.
- Structured reads/mutations support JSON output and structured errors, with scoped help, explicit sources, and confirmation for destructive commands.
- `inspect ... --json` remains standalone export without creating an app/review.
- Skill installation targets Claude or other agents at project/user scope; both-target installs choose shared symlink or independent files and protect custom content.
- Fix-prompt exports are instructions, not source modifications.

## Packaging and runtime paths

Build dependencies through the workspace task graph, then run the CLI bundle. Its packaging script includes the standalone local Next.js app, assets/fonts, runtime dependencies, local job engine support, and bundled skill. A clean archive install is a separate verification scenario from source tests.

The CLI package is private and not published at this baseline. Normal data lives in OS application-data storage; jobs/state are per-root subdirectories, while reviews.sqlite is the per-user local store. Disposable transport/session paths are separate from durable data.

## Separate hosted services

`apps/web` retains public landing, Better Auth email/password and OAuth, OTP verification, device approval, and account/device API routes. Its dashboard is a placeholder. `apps/connection-server` retains Express/ws presence with ticket/auth boundaries. `packages/database` owns hosted Drizzle/Neon infrastructure.

Hosted development uses its own configured environment and services. Local review does not depend on hosted sign-in, Neon, Mailjet, OAuth, Trigger.dev, cloud source upload, or a hosted inference proxy. Existing historical environment/schema artifacts are not proof that a superseded cloud review flow is active.

## Verification and future changes

See [checklist.md](checklist.md) for the current verification ledger and [README](../README.md) for commands. Local source/fixture tests, typechecks, opt-in process/package tests, real provider checks, and human browser exploration are different evidence.

Future completion notifications, finding states, automated fix verification, command execution, hunk grouping, Git mutations, and report generation are described only in the [roadmap](local-review-roadmap.md). Their implementation must extend the existing identities, storage, and lifecycle rather than silently substituting the old hosted design.
