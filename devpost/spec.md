---
doc: spec
status: approved
last-reconciled: 2026-10-26
implementation-baseline: 6d3fde6
---

# Senslop — Current Technical Specification

## Purpose and source of truth

This specification describes the existing local application at the recorded baseline. It replaces the superseded cloud-upload/managed-inference design previously mixed into this file.

Read [scope.md](scope.md) for the boundary, [prd.md](prd.md) for behavior, and [local-review-roadmap.md](local-review-roadmap.md) for approved delivery scopes, historical implementation evidence, and remaining release work. The approved scopes of all 20 features are present in this baseline; recheck code and installed package versions before extending it.

The recorded commit includes the committed daily-workflow delivery and October 26 UI/runtime follow-ups on `feat/finish-daily-workflow`. The verification ledger separates source/fixture evidence from live-provider and release/platform checks.

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

Feature 1 implements background capture, independent reading views, caller-folder context, persisted list status, queue controls, recovery, and shared capacity. Completion notifications use the Group 3 opt-in browser delivery layer. CLI/browser bootstrap URLs carry review and optional file selection privately; returned public locations omit session capabilities.

## Git capture and bounds

The CLI and browser share the [Git collector](../packages/review-core/src/features/git/repository.ts) and [snapshot implementation](../packages/review-core/src/features/git/snapshot.ts).

Supported sources are working tree, single-commit first-parent delta, validated endpoint range, and local branch comparison with an optional base. Read operations do not fetch, pull, check out, or mutate repository state.

Captured files retain repository-relative path, original path where applicable, status, before/after text and hashes, diff, and binary metadata. PNG/JPEG/WebP previews freeze verified magic bytes with a 2 MiB per-side bound and count base64 toward the snapshot bound; other binaries and unavailable images retain explicit fallbacks. Only the explicit `.senslop/review.json` path is exempted from the private-state directory exclusion. Source identities and fingerprints detect changes around capture and re-sync. Filesystem handling enforces path/realpath boundaries and secret exclusions.

Current contract/capture bounds include a 1 MiB limit for selected text file contents, a 20 MiB serialized snapshot including metadata/diffs, and at most 2,000 files. Refer to implementation constants for exact enforcement and captured-context limits. Oversized selections fail explicitly rather than silently truncating review content. Binary contents are not provided as text to analysis.

Ordinary saved-review inspection accepts small changes. Legacy standalone `inspect ... --json` still reports eligibility using five nonbinary files with at least ten changed lines each and may exit 2; this is not a local review admission requirement.

## Persistence and migrations

The [LocalStore](../packages/review-core/src/db/local-store.ts) uses SQLite WAL, a busy timeout, foreign keys, explicit transactions, and restrictive filesystem permissions. The current `user_version` is 8; older initialized databases receive a pre-v8 backup before migration, and newer unsupported data versions are rejected.

| Table                               | Responsibility                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| reviews                             | Repository-keyed saved review JSON, source, round, notes, completion, and selection |
| active_reviews                      | Current review ID for a repository                                                  |
| connections                         | Nonsecret provider connection metadata                                              |
| preferences                         | Saved application/review/AI settings by preference key                              |
| credential_cleanup                  | Pending OS credential cleanup                                                       |
| ai_jobs                             | Grouping/correctness jobs and saved output                                          |
| ai_conversations                    | Snapshot chat history                                                               |
| ai_context                          | Captured source, static analysis cache, and incremental grouping context            |
| ai_batch_checkpoints                | Resumable analysis batch output by job/checkpoint                                   |
| review_rounds                       | Immutable source/context for captured rounds                                        |
| review_findings                     | Durable finding observations and human decisions                                    |
| fix_tasks, check_runs               | Agent task lifecycle and explicit command results                                   |
| execution_manifests                 | Exact managed source hashes, modes, and dependency identity                         |
| review_usage, finding_verifications | Model accounting and revision-bound assessments                                     |
| review_precision, review_briefs     | Region organization and versioned request criteria                                  |
| notification_events                 | Ordered activity feed and atomic per-event delivery claims                          |
| review_reports                      | Immutable per-round report versions                                                 |
| git_operations, checkpoint_records  | Git outcomes, coverage, and exact-object overrides                                  |
| repository_leases                   | Cross-operation repository ownership and dead-owner recovery                        |

Provider metadata, machine capacity, and appearance use shared per-user data. Project source/AI/review preferences use common-Git-directory keys; review limits use explicit review IDs. Worktree roots retain independent reviews and execution records. Repository isolation is enforced for review reads/writes. Deleting a review cascades associated job/context/conversation records through the implemented persistence paths.

History summaries expose recorded directory or null for legacy data. Search uses literal, case-insensitive name/directory matching scoped by repository. No launch-folder schema migration was required because metadata lives in review JSON.

## Workspace service and re-sync

[LocalWorkspace](../apps/local/src/features/workspace/lib/local-workspace.ts) coordinates repository reads, inspection, captured context, CLI handoff ingestion, and re-sync. [Server workspace](../apps/local/src/features/workspace/lib/server-workspace.ts) constructs it from typed runtime exports.

An eligible re-sync identifies the saved working-tree review by ID and expected hash/round with captured branch/HEAD, independently of global selection. A workspace operation queue plus common-Git-directory leases coordinate capture, task application, and Git mutations; persistence rechecks expected identity before publishing. Keep mode updates the same ID, carries original references/notes, retains unchanged-file completion, and preserves the original directory. New mode saves a newer-edits review while retaining the older review. Changed branch/HEAD requires a new review.

[Note anchoring](../packages/review-core/src/features/history/note-anchors.ts) retains/remaps exact excerpts where unambiguous; original note context is not replaced with unrelated live source. Superseded jobs cannot publish over the current round. Original correctness output remains historical. Durable finding observations and decisions live separately; absence in a later run does not imply resolution.

## Frozen context and analysis

[Context capture](../apps/local/src/services/analysis/frozen-context.ts) stores a bounded source view for the captured snapshot. [Worker coordination](../apps/local/src/services/analysis/source-analysis.ts), [snapshot analysis](../apps/local/src/services/analysis/snapshot-analysis.ts), [frozen compiler](../apps/local/src/services/analysis/frozen-compiler.ts), and workspace package resolution produce symbols, references, dependencies, cycles, diagnostics, and related-test information where available.

Frozen compilation runs in a separately bundled Node worker with a 120-second limit, serialized compilation, a small shared request cache, and failure eviction. Development/test use the same worker source through tsx; production uses `.analysis/source-analysis-worker.mjs`. Protected preview/workspace/agent routes return saved state before `after()` schedules background jobs; scheduling no longer prepares frozen context inline.

Read-only tools list/read/search frozen source and expose that analysis. Before/after reads keep the captured sides distinct. JavaScript/TypeScript receives compiler-backed support; arbitrary languages do not have equivalent semantic coverage.

Diagnostics use captured configurations and available source. External declaration files, generated project-reference outputs, unresolved dependencies, bounded context, and dynamic runtime behavior limit conclusions. No project test/build process is executed by these source tools.

## AI task pipeline

[Agent schemas](../apps/local/src/features/agents/schemas.ts), [repository agent](../apps/local/src/services/ai/repository-agent.ts), [structured analysis](../apps/local/src/services/ai/structured-analysis.ts), and [validation](../apps/local/src/features/agents/lib/validate-results.ts) define the analysis boundary.

- AI settings select a shared task model or separate Grouping, Context, Review, and Explain assignments. Grouping mode defaults to never; instructions and connection capacities are configurable.
- Jobs snapshot settings when created. A context agent can retrieve supporting source for analysis rather than relying solely on changed lines.
- Large work is budgeted and batched, with persisted checkpoints and bounded format/coverage repair. Incremental grouping can reuse previous round context.
- The initial file-summary phase covers each selected file once with rationale, related paths, and order; precise region organization can then place one file in several flows while owning each changed region once. The contract expresses prerequisite-first/test-last intent; validation verifies coverage and paths rather than proving semantic ordering.
- Correctness findings require supported severity and exact evidence matching frozen selected change locations. Invalid or incomplete output fails or follows the implemented bounded repair path.
- Combined and per-finding fix prompts include location/context and ask the downstream agent to evaluate validity before fixing.
- Chat and explanations stream through their dedicated endpoints and persist supported conversation states. Their model choices are distinct from assigning every background task role.
- Adapter behavior follows configured capabilities for tools, structured output, context/output limits, and subscription routing; generated schemas use provider-compatible JSON Schema while validating results against the Zod contract.
- ChatGPT subscription and Vercel Gateway structured calls use `ToolLoopAgent.stream`, an overall 15-minute call timeout, and eight-minute first-content/inactivity limits. Buffered providers use the same overall budget and an eight-minute per-step limit. Explicit completion checks reject truncated/refused/capped responses; user cancellation bypasses format-repair retry. Chat retains its separate timeout policy.
- Verification includes bounded exact before/after target excerpts and diff context, with tools available for further frozen-source investigation.

Generation/round/hash checks prevent stale writes. Analysis limits are recorded explicitly; evidence validation and successful model output do not certify code correctness.

## Job engine and capacity

[Dispatch](../apps/local/src/services/inngest/functions.ts), [execution](../apps/local/src/services/inngest/jobs.ts), and [AgentStore](../apps/local/src/features/agents/lib/agent-store.ts) provide queued/running/completed/failed/canceled state, dispatch identity, cancellation events, retry/recovery, saved histories, and active matching-job reuse.

The analysis function currently limits active execution to two slots and to one slot per snapshot/task kind. These are Inngest execution-step limits. [Provider request limiting](../apps/local/src/services/ai/request-limiter.ts) separately controls concurrent/budgeted model calls and adapts to configured capacity.

The existing adaptive process limiter is layered with a shared SQLite admission coordinator in ai-capacity.sqlite beside reviews.sqlite. It tracks queued requests, active slots, process IDs, and one-minute input/output/request reservations, using transactions across repository processes in that data namespace. Matching endpoint/account hashes share capacity without persisting credentials. A total machineConcurrency ceiling defaults to four, and active captured policies use the strictest applicable ceiling. Streaming retains admission through consumption/cancellation. Nested native-context requests reuse the parent slot while reserving their own quota. Dead process slots are reclaimed; usage reservations remain conservative until expiry. Separate data directories and outside clients are independent. Capacity preference changes, including the total ceiling, are rejected while queued/running saved jobs exist. Waiting clients time out without deleting jobs.

Grouping preparation retains terminal fallback to original files. History projects the latest persisted job for each kind and exact review revision without returning model settings or result bodies. Readability and optional correctness state remain separate. Queued priority changes invalidate the previous dispatch and send a replacement with a bounded 120-second scheduling preference. Retries link through retryOf and preserve captured settings/revision/priority. Batch checkpoints are reused only within that retry lineage; an intentional completed-run re-analysis starts fresh. Dispatch generation plus owner-start identity reject old execution after reprioritization or restart. Existing active-view activity feedback is retained; background completion notifications use the Group 3 event feed.

## Local API boundaries

These Next.js routes implement the current local surface; consult their request schemas for exact methods and payloads.

| Route                                        | Responsibility                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| /api/health, /api/session                    | Authenticated discovery/readiness and browser session handoff                                       |
| /api/preview                                 | Current saved preview and legacy CLI transport handoff                                              |
| /api/workspace                               | Repository metadata, history/search, inspect/open/change/re-sync operations                         |
| /api/workspace/updates                       | Revision polling for external CLI writes                                                            |
| /api/agents                                  | Jobs/results, history, conversation/run mutations, cancellation, and fix-prompt exports             |
| /api/agents/chat, /api/agents/explain        | Snapshot chat/explanation streaming                                                                 |
| /api/agents/settings                         | AI settings reads and validated updates                                                             |
| /api/about, /api/notifications               | Version/update diagnostics and persisted local activity                                             |
| /api/git, /api/project-memory, /api/reports  | Guarded Git actions, explicit guidance, and immutable round reports                                 |
| /api/providers, /api/providers/models        | Connection operations and model metadata                                                            |
| /api/providers/subscriptions                 | Subscription sign-in/status/cancel/sign-out                                                         |
| /api/review-preferences, /api/ui-preferences | Persisted review and UI configuration                                                               |
| /api/workflow                                | Finding decisions, fix tasks/application, checks/artifacts, verification, usage, and history hiding |
| /api/project, /api/projects                  | Source/execution policy, data management, and project/worktree discovery                            |
| /api/precision, /api/review-intent           | Region/flow organization, completion, versioned briefs, and request criteria                        |
| /api/source-explorer, /api/review-quality    | Frozen navigation/search and deterministic or opt-in live quality reports                           |
| /api/inngest                                 | Local worker endpoint and registration                                                              |

Session/capability and origin checks protect local operations. Browser APIs expose configured credential state, not saved secrets. The worker uses its distinct runtime capability/signing configuration. Do not expose capability-bearing URLs as public project links.

## Browser state, UI, and shortcuts

TanStack Query owns resource queries/mutations. History uses a 250 ms Pacer debounce. A local workspace revision poll invalidates affected queries after external CLI operations. Preview polling uses the tab's pinned review ID, retaining immutable file objects on metadata updates. Browser actions apply the returned review only to their provider; background creation and another client's shared-default selection do not navigate existing tabs. History polls while open and preserves rows during refresh, including queued controls and rename drafts. Snapshot and job status icons share the title row with rename/delete controls; full status details and icon actions have hover/focus tooltips and accessible labels.

The diff workspace composes files/notes, central canvas, and Agents panels with responsive drawers, focused reading, grouped toolbar actions, and a command palette. File overview orders summary, impact, and symbols; completion tints surrounding surfaces without replacing the diff background. Shared collapsibles animate height/opacity, and confined lists/toolbars use scroll fades; the search Input variant is transparent, edge-to-edge, and vertically bordered. Persisted UI preferences include application/editor themes, fonts, view/options, panel sizes, and buddy configuration. Pending preference mutations overlay confirmed data to avoid older responses undoing newer input.

Settings use reusable section/screen definitions, breadcrumbs, and optional headerActions. The header parent uses `flex items-center gap-2 min-w-0`, title wrapper `flex-1 min-w-0`, and actions wrapper `shrink-0`. Provider navigation from AI settings passes the full section so those actions remain.

[useKeyboardShortcuts](../packages/ui/src/hooks/use-keyboard-shortcuts.ts) wraps TanStack registration, shared/per-binding options, repeat/overlay policy, and an unmount AbortSignal. Native `ignoreInputs: true` supplies input filtering, including shadow inputs. Accepted events apply configured preventDefault/propagation behavior. K opens file search; D completes; arrows navigate; R/brackets handle saved history; Mod+K opens commands and F toggles focused reading. Workspace-specific note/Git/report/context/round/new-review/re-sync bindings live in `use-workspace-toolbar-shortcuts.ts`; the shared sidebar uses Mod+B.

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

## Fix and verify architecture

`packages/contracts/src/workflow.ts` defines finding/observation history, immutable round identities, fix tasks, check results, execution manifests, verification runs, project policies, usage records, and private session discovery. Migrations add `review_rounds`, `review_findings`, `fix_tasks`, `check_runs`, `execution_manifests`, `review_usage`, and `finding_verifications`. Old reviews/runs remain readable; new revisions archive source and frozen context. Nested SQLite operations use savepoints.

`packages/review-core/src/features/workflow` owns persistence, conservative finding matching, revision guards, manual decisions, exact check linkage, task ownership/transitions, source materialization, process supervision, source/provider policy, usage admission, project discovery, and retention. The root-scoped Next APIs `/api/workflow`, `/api/project`, and `/api/projects` share existing local capability/origin protection. Source context remains frozen and source-policy-checked. Browser hooks own their TanStack Query configuration in feature hook files. Finding observation matching consumes at most one distinct location per finding per job, preserves exact replay identity, and prefers unambiguous locations across runs.

Managed source uses a detached `git worktree add --no-checkout`, streamed policy-permitted Git blobs, and full captured working-tree overlays from `syncBaseline` when available, including unchanged dirty helpers and deletions outside the current round diff, with SHA/mode manifests and a separate index. The 20 MiB serialized review snapshot limit is not an aggregate execution-tree limit: unchanged tracked files stream through `git cat-file --batch` with raw SHA-256/mode manifests, and unchanged large assets are compared by streaming digest before loading task return text. Changed returned text retains its 1 MiB bound; binary source overlays still require exact available hashes and their own bound, while unsupported/missing inputs fail explicitly. Worktrees share Git objects and host access. Current-worktree tasks require explicit selection and fresh identity; managed application checks destinations, preserves modes/index, and rolls back only bytes written by that application when possible. Task return explicitly rejects file-mode changes, including mode-only edits and newly executable files, instead of silently omitting them. Application and re-sync share the workspace operation queue.

The command supervisor owns a shell process group, streams bounded output, and terminates child work on cancellation, timeout, or parent disconnection. Standard tool/runtime environment variables are allowlisted; application/provider credentials are not injected. Result metadata includes dependency manifests/installed metadata, selected artifacts, exact source side, and revision. Modifying captured inputs invalidates a pass. Filesystem inventory comparison detects restored deleted files and staged additions independently of the mutable Git index and ignore rules; dependency/build outputs and explicitly selected generated artifacts remain excluded from additional-source detection. Automatic cleanup uses the same comparison. Artifact downloads recheck recorded hashes and current policy; cleanup can make old artifact bytes unavailable while retaining metadata.

Inngest registers check and verification functions alongside existing analysis. Queued records redispatch after restart; interrupted running checks require an explicit new run. Verification uses frozen read-only tools, persists partial results, and publishes against the current revision without resolving human decisions. Passing checks attach only when their finding IDs and exact changed revision match.

Model middleware applies current source/local-only policy before every supported model request, reserves review token/time allowances transactionally, and records measured usage at completion. Active requests recheck shared persisted accounting against one aggregate request-time allowance, including requests admitted by another store connection; completion releases their active time contribution into measured duration. Unknown reservations remain conservative. Saved analysis captures Quick/Thorough depth; retries retain it, and incremental grouping requires compatible source, settings, and depth. Source-policy changes block old conversation continuation and excluded original finding evidence. Models without reliable pricing keep cost unknown; no invented zero charge or dollar budget is shown.

The browser adds finding filters/decisions/history, round comparison, task/change review, command logs/artifacts, verification history, context/routing inspection, project switching, source/privacy/usage settings, and shadcn/Recharts usage charts. Work uses full-width icon tabs; creating a task or verification emits feedback and selects its tab. Apply has a shared pending state, duplicate-submit guard, LoadingSwap, and outcome toasts; verification findings have status/tooltips plus nested evidence, while checks default only Output open. History removal persists hidden finished IDs in review/kind preferences, preserves evidence, and rejects active-item removal. Notes are contiguous padded rows. The Pierre 1.5.2 React adapter reapplies controlled selection after `onPostRender`; a parent layout effect reapplies `activeLineSide` after that synchronization so split selection stays on its initiating side. Real-renderer tests cover pointer-down, multi-line drag, release, and rerender on both columns.

The bundled agent skill and CLI support explicit finding/task/check/verification/round/usage operations. External-agent launch adapters remain optional; the implemented integration is copy/export plus claim/return/apply through the authenticated original project. The expanded precision corpus and comparison harness separate deterministic contracts from opt-in live findings/grouping judgments. Real-provider diagnosis quality remains unmeasured in this delivery.

## Review with precision architecture

`packages/contracts/src/precision.ts` defines units/ranges/flows, organization actions, briefs, criteria/evidence, rules/profiles/provenance, language capabilities, and relationships. SQLite v7 adds round-keyed `review_precision` and append-only `review_briefs` with review foreign-key cleanup. Shared arrays define enum values. Existing file completion and unit completion synchronize atomically; organization writes guard both source identity and organization version.

`PrecisionStore` lazily derives exact diff regions, migrates matching saved file grouping/completion, validates unique ownership, and supports manual organization. Reconciliation retains only unambiguous source matches, including manually split/combined unchanged ranges; changed or ambiguous ownership requires review. Model region grouping runs after existing file summaries, validates supplied region IDs, and falls back to file-based organization with inspectable limitation metadata; the main canvas omits the redundant standalone warning row. Publishing and persistence share the existing job transaction; manual organization survives ordinary regrouping until explicitly reset.

`ReviewIntent` stores brief versions and validates exact source excerpts. Criteria become verified only through their explicitly linked passing changed-side checks for the same hash/round, with source-changing checks excluded. The job captures its brief and effective instructions after frozen context loads; retries retain that capture. Rule precedence is built-in, root, nested subtree, local project, then one-review override. Per-path profile scopes and rule provenance are passed as explicit instructions, separate from untrusted source/documents.

Frozen analysis version 4 retains TypeScript compiler facts/callers and composes Python/Go Tree-sitter adapters. Parser/runtime/grammar native files are included in standalone tracing. Optional bounded stdio LSP processes analyze temporary copies, reject outside-root reference URIs, isolate failures by language, and stop/clean up after completion. Capability labels distinguish semantic, parsing, and text support. Settings hashes invalidate cached analysis. Before-side exploration analyzes the frozen before map; archived rounds never substitute current disk.

`/api/precision`, `/api/review-intent`, `/api/source-explorer`, and `/api/review-quality` share protected local-session boundaries. Feature hooks keep their TanStack configuration together. `ExpandingTabs` is exported by `@senslop/ui`, composes installed Base UI Tabs and tooltips, animates active/inactive widths, supports keyboard and reduced motion, and exposes controlled/uncontrolled items with icons/details/disabled states. Region browser/editor, requirements, rules, impact, search, image/JSON readers, and settings compose shadcn primitives.

The per-tab reading trail stores revision/path/side/region/context/scroll and bounds history to 100 entries. Region/full-file and incremental unchanged-context controls retain original coordinates. Whitespace controls affect rendering only. Attention uses visible reasons, generated/repetitive collapse preserves completion totals, renamed paths remain explicit, and supporting source is read-only.

Quality reports persist the latest 20 synthetic-corpus runs under a common-Git project preference key. Reports retain model/instruction identity, expected outcomes/provenance, exact findings/group ownership, contract results, diagnosis/evidence/grouping metrics, latency, and available token/cost data. Live runs require explicit opt-in and obey the local-inference route plus token/time limits; deterministic cases do not call providers. Model-level judgments presently cover findings and grouping; requirement/round/fix checks are deterministic. Promotion thresholds and real-provider evidence remain open.

CLI `regions`, `brief`, `rules`, `source`, and `quality` operations use the same APIs and exact identities. Version flags protect stale organization/brief editors. Live CLI automation requires `--live --yes`; default quality runs are deterministic. The bundled agent instructions describe these boundaries without authorizing unrelated source changes or paid runs.

## Separate hosted services

`apps/web` retains public landing, Better Auth email/password and OAuth, OTP verification, device approval, and account/device API routes. Its dashboard is a placeholder. `apps/connection-server` retains Express/ws presence with ticket/auth boundaries. `packages/database` owns hosted Drizzle/Neon infrastructure.

Hosted development uses its own configured environment and services. Local review does not depend on hosted sign-in, Neon, Mailjet, OAuth, Trigger.dev, cloud source upload, or a hosted inference proxy. Existing historical environment/schema artifacts are not proof that a superseded cloud review flow is active.

## Verification and future changes

See [checklist.md](checklist.md) for the current verification ledger and [README](../README.md) for commands. Local source/fixture tests, typechecks, opt-in process/package tests, real provider checks, and human browser exploration are different evidence.

Group 3 uses review-core modules for project memory, Git/checkpoints, reports, notifications, and updates, with shared contracts and protected local APIs. SQLite format 8 adds report/event/Git/checkpoint/lease records; existing databases receive a pre-migration backup. Git leases share the common Git directory and dead-owner recovery. Staged candidate identity, hook guards, and outgoing object identity prevent stale approval; pulls use ff-only without automatic stashing. The terminal pre-push wrapper replays existing hook input before evaluating the same checkpoint policy.

Reports store immutable captured-round outcome versions; HTML escapes authored content with a restrictive CSP. Evidence and exports apply current source policy. Browser form drafts use tab-local state plus a restart backup, bounded size and 30-day expiry; successful submissions clear them, and note cancellation also clears its draft. Notifications require browser permission, category opt-in, event cursors, and atomic server-side event claims; Web Locks serialize local delivery when available, with direct delivery using the same claims otherwise. Notification-worker preparation has a ten-second timeout; browser submission itself is awaited without a misleading timeout because it cannot be canceled. Completion events are recorded at job publication/failure, without requiring a later rename; the minimal service worker handles click navigation without source caching or a remote push service.

Update checks use the stable @senslop/cli npm registry release with bounded requests and cached availability. Installation supports detected global npm/pnpm copies, validates a pinned version, rejects active work/running owners, backs up SQLite, and invokes argument-based package-manager commands after explicit confirmation. Source/archive copies do not self-replace. About owns diagnostics; `/ai-test` and its inference helper are retired. Fixed input-aware hotkeys remain; configurable shortcuts and publishing are deferred.

## Review-defect corrections — October 26, 2026

The follow-up source baseline `6d3fde6` corrects checkpoint, report, memory, update, and browser-state defects without expanding the approved product scope. Checkpoints resolve the configured push destination, inspect the complete tip against the empty tree for new branches when history is disabled, and match unresolved findings across saved reviews/rounds against exact outgoing file hashes. Check evidence uses raw-byte hashes for both binary and text content; Git blob digests stream independently of the former 25 MiB buffer bound. Whole-file rename unstaging restores both index paths, and exact-object pushes explicitly configure tracking for the local branch after success.

Project guidance resolves its origin within the common Git project, and queued memory autosaves advance their version from each server response even after settings close. Reports prefer job-captured briefs or inherited earlier-round briefs, retain verification evidence paths, and apply current policy to reads/exports, including older pathless verification records. The report dialog resets revision-specific selection and rejects cross-review report data.

Notification claims are renewable two-minute leases, distinct from a completed delivery acknowledgement; abandoned leases can be recovered, and pending claims elsewhere do not advance the browser cursor. Delivery retries every three seconds even when polling returns structurally identical data. Explicit valid Work-tab links override saved tab selection, while view-state restoration uses a matching server/hydration snapshot before reading browser storage. Global-install detection resolves the executable real path before classifying the package manager.

The [verification ledger](checklist.md#review-findings-follow-up--october-26-2026) records focused regressions and the full-suite result; no live notification banner or provider inference was exercised by this follow-up.
