---
doc: local-review-roadmap
status: active
context-date: 2026-10-24
implementation-baseline: 0860767
---

# Senslop: the ultimate local code review platform

## Start here in a new chat

This document preserves the owner's product direction, the implementation inspected during the discussion, and the full 20-feature roadmap. Read this section, the product direction, and the selected feature before planning implementation. Consult the code map and acceptance criteria for that feature as needed.

The owner requested this roadmap after discussing existing functionality and multiple simultaneous CLI clients. They then explicitly requested that it be saved as Markdown for future chats. This document records future work; creating it does not implement or verify those features. Priorities, detailed designs, and suggested delivery chunks below are recommendations unless explicitly identified as owner decisions.

To resume, a useful request is:

> Read devpost/local-review-roadmap.md and the repository instructions. Check the current implementation of feature 1 against its acceptance criteria, identify what is already present, and propose the first small implementation chunk. Preserve the local review direction and distinguish existing behavior from proposed behavior.

Before changing application code:

1. Read the current root and applicable nested `AGENTS.md`, [PRD](prd.md), and [technical spec](spec.md). Follow the user's latest instructions when they supersede older documents.
2. Inspect Git status, current versions, and relevant code. The baseline in this document will become stale as work progresses. Preserve unrelated edits.
3. Choose a feature or an independently useful part of it. Reuse existing contracts, persistence, discovery, and jobs before introducing alternatives.
4. Research the official documentation for the versions involved, as required by the repository instructions. Resolve open decisions that materially affect behavior; use routine implementation judgment for smaller choices.
5. Break implementation into coherent chunks, generally fewer than ten files, with an outcome and verification step. Write behavioral tests first when adding tests. Verify schemas through review and typechecking rather than dedicated schema tests.
6. Update the feature's status and evidence only after implementation and verification. State which scenarios remain unverified. Provide the required flow-based review guide.

**Feature 1 update — October 24, 2026:** the owner approved implementation with two changes: CLI creation opens the first saved review automatically and otherwise prepares in the background, with `--open` forcing an explicit Open; completion notifications and their preferences are deferred to a later feature. The owner subsequently requested topic-based commits, with mixed-file hunks separated. Read the progress record for implementation commits and verification evidence before resuming.

## Confirmed product direction

The owner's vision is **the ultimate local code review platform**. The primary audience is developers using coding agents who want to understand changes and catch bugs before pushing them to a remote repository.

The intended loop is:

**Make changes → review locally → investigate findings → fix → verify → commit and push when ready.**

Confirmed scope decisions:

- Local changes are the primary review source. Working-tree reviews should be useful before a commit or push exists.
- Human understanding and automated correctness analysis both belong in the product. Organized reading, code explanations, notes, and agent findings complement one another.
- Git conveniences such as push and pull from the app are welcome. The owner initially rejected GitHub integration as the product's direction, then clarified that these convenient operations are acceptable.
- Hosted pull-request ingestion, team approvals, reviewer assignments, and a replacement for GitHub's collaboration platform are not goals of this roadmap. Revisit only if the owner changes direction.
- Multiple terminals should be able to submit work to a running local app. Background analysis should let the user continue working without waiting for every review.
- The agreed target experience lets the user read Review A while Review B prepares, shows B's status in the review list, and offers an explicit way to open B when ready. It preserves A's reading state.
- Background preparation, explicit review IDs, instance ownership, and concurrency remain **one feature: feature 1**. Keep their requirements together when referring to this roadmap.
- Review history groups by the folder associated with the CLI operation, independently of canonical Git-root isolation. Existing implementation captures the app owner's launch folder; extending this to individual requesting terminals is part of feature 1.
- The initial recommendation is to prioritize features 1–6. The first major milestone combines features 1–5 into a usable fix-and-verify workflow.

The motivation is reducing unnecessary push/review/fix/push cycles. Claims about competitors' present capabilities were not researched and are not requirements or verified market comparisons.

## Relationship to existing planning documents

[scope.md](scope.md), [prd.md](prd.md), [spec.md](spec.md), and [checklist.md](checklist.md) were reconciled with the current local application on October 24, 2026. They describe current scope, behavior, architecture, and verification status. Superseded hosted-upload plans and old progress narratives remain in Git history; dated research files are explicitly historical.

Use this document for the future roadmap and owner clarification, and the current scope/PRD/spec for implemented behavior. The actual code remains the authority when a baseline becomes stale. Before implementation, reconcile the selected feature with the applicable PRD/spec section; preserve clear provenance for changed decisions rather than silently declaring every proposal approved.

This roadmap expands the long-term product direction. All 20 features are not prerequisites for a hackathon submission, and the roadmap does not authorize implementing or publishing all of them at once.

## Existing foundation at the baseline

The following capabilities were found in the code. This inventory is not a claim of exhaustive production verification.

| Area                 | Present capability                                                                                                                        | Important boundary                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Git sources          | Working tree, single commit, endpoint range, and local branch comparison through browser/CLI paths                                        | Inspection is repository-bound and does not itself push, pull, or edit Git state                                                     |
| Review organization  | AI groups changed files by behavior, writes summaries/rationale, and proposes prerequisite-first order with tests last                    | Each changed file belongs to one group; hunk-level membership is future work                                                         |
| Context              | Frozen source, search, symbols, references, dependencies, and related-test discovery                                                      | Compiler-backed semantics are strongest for JavaScript/TypeScript; captured dependency declarations and runtime evidence are limited |
| Correctness analysis | Findings with severity, exact frozen evidence, navigable locations, limitations, and fix prompts                                          | Matching evidence to source validates the reference, not the truth of every conclusion; individual finding decisions are absent      |
| Understanding        | Snapshot chat and explanations of selected source lines                                                                                   | Explanations do not execute tests or apply fixes                                                                                     |
| Reading UI           | Split/unified diffs, highlighting, settings, file search, keyboard navigation, notes, completion, and a configurable buddy                | Completion currently centers on files; the UI does not yet provide every proposed navigation or focused-reading feature              |
| Persistence          | Local SQLite reviews, notes, selected file, completion, conversations, and analysis histories                                             | Opening/creating reviews shares one active review per repository                                                                     |
| Re-sync              | Keep-mode review rounds and a separate new-review mode with captured baselines                                                            | Current re-sync requires the active working-tree review on the same branch and HEAD; it is not finding-by-finding fix verification   |
| Organization         | Repository isolation and history grouped/searched by recorded launch folder; filenames/path headings use monospace                        | Older reviews have no recorded folder; CLI clients currently inherit the app owner's folder                                          |
| Agent access         | Structured CLI commands and a bundled review skill for preparing/reading reviews, notes, settings, runs, and exports                      | Explicit background creation without activation needs work; human-note export is not yet a complete consolidated review report       |
| Runtime              | Per-repository app ownership, authenticated discovery, persistent local job engine, deduplication, cancellation/retry/recovery mechanisms | Closing the owning app stops execution; command processes are clients, not independent permanent workers                             |
| Providers            | Remote/local provider choices, role-based model choices, capacity settings, and OS credential storage                                     | Local storage does not imply local inference; configured remote models receive selected context                                      |

### Baseline behavior that mattered for feature 1

- `resolveRepository` resolves the real Git working-tree top level. Folders inside that root share the current workspace identity; a launch folder is metadata, not a separate server identity.
- `workspacePort` checks the saved owner PID. A second app launch for the same owned workspace is rejected. When no owner exists and an unrelated process occupies the saved port, it chooses and persists another available port.
- A private session descriptor supplies the loopback origin and capability token. Clients verify the authenticated health response before attaching; discovering an open port alone is insufficient.
- App ownership is scoped by the application-data directory and resolved root. Explicitly choosing a different data directory currently creates a separate runtime namespace; avoid claiming unconditional machine-wide singleton ownership.
- At the original baseline, `reviews create` captured **and activated** a review. `reviews open` changes the active review observed by browser tabs. The non-interrupting background behavior discussed with the owner is a target, not already complete.
- `current` refers to shared mutable selection. Two clients can safely hold distinct review IDs, but a later command using `current` can target another client's newly activated review.
- The current analysis function configures two active execution slots and one per snapshot/analysis kind. Inngest counts executing steps, not every in-progress workflow or every underlying model request.
- `AgentStore.createJob` reuses an active matching job for a snapshot revision and kind. Model-request concurrency has its own controls, and separate app processes do not provide a machine-wide quota coordinator.
- Current review folder capture comes from `SENSLOP_LOCAL_DIRECTORY` set at app startup. A second CLI client does not send its effective launch folder in its review-creation request.
- A keep-mode re-sync preserves the review's original directory and cancels superseded work. Existing snapshot round/hash and job-generation checks are foundations to extend, not reasons to invent unrelated identity systems.

## Vocabulary and invariants

| Term                | Meaning for this roadmap                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace           | Running local app and job engine associated with a resolved working-tree root and application-data namespace                                      |
| Launch folder       | Effective folder selected by the caller, including an explicit `--repo` path; distinct from the Git root                                          |
| Review ID           | Stable public identity of a saved review; currently the saved snapshot UUID. Keep-mode re-sync retains it, while a new review receives another ID |
| Review revision     | Review ID plus round and content hash, with captured Git/source identity; identifies the exact code under discussion                              |
| Analysis job ID     | Existing API/CLI-visible job identity, currently used by `runs` commands; separate from the review ID                                             |
| Worker run ID       | Job-engine execution identity, currently also stored as `job.runId`; do not confuse it with the CLI's job ID                                      |
| Finding ID          | Proposed durable identity of an issue and its observations across revisions; currently findings do not provide this full lifecycle                |
| Active view         | Review/file/position a reader is looking at. Background creation should not implicitly change it                                                  |
| Verification record | Proposed command/test result tied to the exact source and execution environment, not just to whichever review is active                           |

Cross-feature invariants:

- Reads, writes, agent handoffs, and verification identify the intended review revision. Stale operations must return a recoverable conflict rather than overwrite newer work.
- Job completion order does not determine what the user is reading or which source a result belongs to.
- Frozen evidence remains available for previous rounds. Live filesystem contents must not be silently substituted for recorded evidence.
- Existing notes and history require backward-compatible migration when new identities or statuses are introduced.
- A valid source location, a model judgment, a passing test, and a human decision are distinct forms of evidence.
- Parallel read-only analysis is compatible with shared snapshots. Repository mutations and fix operations need explicit coordination around the affected working tree/index.
- Normal review remains usable without AI configuration. Remote inference and local inference have visible, different source-routing implications.

## Feature overview

“Extend” means a foundation exists, not that the feature's acceptance criteria already pass. This table is a navigation aid, not an implementation checklist.

| ID  | Feature                                         | Starting point                                         | Suggested priority                      |
| --- | ----------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| 1   | Background reviews, review IDs, and concurrency | Implemented; completion notifications deferred         | First milestone                         |
| 2   | Individual finding management                   | Extend saved AI findings                               | First milestone                         |
| 3   | Review rounds and fix verification              | Extend re-sync and saved analysis                      | First milestone                         |
| 4   | Agent workflow for fixing findings              | Extend prompts, CLI, and skill                         | First milestone                         |
| 5   | Local tests and verification results            | New execution workflow around existing static analysis | First milestone                         |
| 6   | Hunk-level groups and completion                | Extend file grouping and progress                      | Next priority                           |
| 7   | Review against the original request             | New requirement-evidence workflow                      | Later capability                        |
| 8   | Repository rules and review profiles            | Extend existing task instructions                      | Later capability                        |
| 9   | Change impact and risk guidance                 | Extend context/dependency analysis                     | Later capability                        |
| 10  | Deeper navigation and diff tools                | Extend reading workspace                               | Later capability                        |
| 11  | Broader language understanding                  | Extend semantic analysis                               | Later capability                        |
| 12  | Git operations inside the app                   | New user-triggered mutation workflow                   | Accepted convenience direction          |
| 13  | Optional checkpoint before pushing              | New workflow using review/verification identity        | After features 3, 5, and 12 foundations |
| 14  | Multiple projects and worktrees                 | Extend per-repository runtime                          | After feature 1 foundations             |
| 15  | Source and model access controls                | Extend capture, providers, and local storage           | Incremental, alongside execution work   |
| 16  | Cost and resource visibility                    | Extend capacity and diagnostics                        | Incremental, alongside feature 1        |
| 17  | Useful project memory                           | New explicit knowledge workflow                        | After feature 2 foundations             |
| 18  | Complete review report                          | Extend notes, findings, and exports                    | After lifecycle foundations             |
| 19  | Everyday usability and distribution             | Extend existing UI and package                         | Continuous improvements                 |
| 20  | Measured review quality                         | Extend tests with evaluation corpus                    | Begin early; expand continuously        |

## 1. Background reviews, review IDs, and concurrency

**Status:** implemented for the approved scope; background completion notifications are deferred. Verification and remaining limits are recorded below.

**Outcome:** several terminals or agents can prepare reviews while a human reads a different review without interruption. This feature owns the complete discussion about app instances, explicit IDs, review-list loading states, background completion, and scheduling.

### Target behavior

1. One app owns a workspace. Additional CLI commands discover it and submit independent operations. Starting the app again should provide its location and a reuse/open path; it must not accidentally create a second worker for the same workspace.
2. Creation, preparation, and opening are separate operations. A background request saves and prepares a review without activating it. An explicit open action navigates the intended reader to that review.
3. Return review ID, round/hash, relevant job IDs, and a safe location/status immediately. `--wait` remains an optional synchronous convenience. New CLI flags or response fields require a deliberate compatibility design; the examples here do not define an already implemented API.
4. Automation retains explicit IDs. Follow-up commands use those IDs and revision expectations rather than resolving shared `current` later. Interactive `current` may remain a convenience.
5. Record the effective caller folder per new review. Honor an explicit `--repo` folder; otherwise use the caller's actual working folder. Validate that it belongs to the resolved workspace. Browser creation can use its selected workspace folder. Keep-mode re-sync preserves the original review folder.
6. Give list rows clear queued/preparing/ready/failed/canceled feedback, meaningful stage progress, and accessible status text. Derive presentation from persisted work. A saved snapshot may already be readable while optional correctness analysis is running or has failed; do not collapse these into a misleading single readiness flag.
7. **Deferred by the owner on October 24, 2026:** completion notifications and notification preferences. This pass preserves the existing reader's selected file, scroll, note draft, focus, and completion state during other reviews' preparation; it adds no background notification system.
8. Provide queue visibility, cancellation, retry, and priority. Capacity limits apply at appropriate workspace/provider/machine scopes. Local models and shared remote quotas need bounded demand across repository processes.
9. Reuse duplicate active jobs for the same review revision and analysis kind. Retries preserve identity/provenance; intentional re-analysis of a completed run remains distinguishable.
10. Persist pending work and recover it on app restart. Explain when execution is unavailable because the owner stopped. The initial design keeps the owner process requirement; an always-running daemon is a separate open decision.
11. Coordinate repository mutations with snapshot capture and other mutations. Reject stale updates with usable retry/reload feedback. Existing immutable snapshots continue to support parallel analysis.
12. Make multi-tab selection behavior explicit. Independent reading positions are a target. Decide how explicit agent-to-human Open actions select their destination without silently navigating every unrelated tab.

### Acceptance scenarios

- Read Review A, type an unsaved note, and prepare B from another terminal. B appears with progress; A's note, selection, focus, and position remain unchanged through B's completion.
- Submit B and C concurrently. Return distinct review IDs, store both, and associate each result with its captured revision regardless of finish order.
- Request the same analysis twice while active. Produce one active logical job rather than two paid executions.
- Change the active review between two automation commands. A command holding A's ID still acts on A; a stale revision fails clearly.
- Use two subfolders within one Git root. Both attach to one workspace, while their newly created reviews retain the correct caller folder and group correctly in history.
- Repeatedly launch the same app, including nearly simultaneous launches. One owner wins and the other gets a useful reuse response. An unrelated occupied port receives fallback behavior, not false ownership.
- Recover stale session/owner state without attaching to an unrelated service or removing another live owner's session. Preserve existing data-directory namespace behavior unless deliberately changed.
- Submit more work than capacity allows. Show queued work, allow cancellation, and enforce limits. Test configured cross-workspace limits without requiring real paid inference.
- Stop/restart the owner with pending work. Recover supported work without duplicate completion, lost review records, or stale results replacing newer rounds.
- Exercise optional-analysis failure and unconfigured AI: the stored code review remains readable, and the UI accurately distinguishes usable content from failed preparation stages.

### Dependencies and entry points

Extend [CLI app startup](../packages/cli/src/features/workspace/local-app.ts), [ownership/ports](../packages/cli/src/features/workspace/local-jobs.ts), [session records](../packages/cli/src/features/workspace/workspace-session.ts), and [client discovery](../packages/cli/src/features/workspace/workspace-client.ts). Then trace [CLI review operations](../packages/cli/src/features/reviews/commands.ts), [workspace operations](../apps/local/src/features/workspace/lib/local-workspace.ts), [local persistence](../packages/review-core/src/db/local-store.ts), [agent persistence](../apps/local/src/features/agents/lib/agent-store.ts), and [job dispatch](../apps/local/src/services/inngest/functions.ts). The principal UI consumers are [history](../apps/local/src/features/workspace/components/review-history.tsx), [toolbar](../apps/local/src/features/workspace/components/workspace-toolbar.tsx), and [live preview state](../apps/local/src/features/review/components/live-preview-provider.tsx).

**Approved decisions:** first CLI review opens automatically; later captures stay in the background unless --open; explicit CLI Open launches a dedicated review-specific browser tab; browser Open affects its own tab. High priority gives queued runs a bounded two-minute preference without preemption. Capacity is coordinated across app processes in the same data directory. The owner process remains required; daemon operation and completion notifications are deferred.

## 2. Individual finding management

**Outcome:** findings become durable decisions that the user can act on and revisit.

**Starting point:** severity, source evidence, fix prompts, and saved correctness runs exist. Findings currently lack a full persistent decision lifecycle.

**Scope:** introduce stable finding identities and observations tied to review revisions; support Open, Accepted, Dismissed, and Resolved decisions with reasons and an audit history. Clarify that Accepted means the issue is judged valid, not that the code is approved. Allow reopening. Filter by status, severity, file, group, and category. Keep severity distinct from evidence strength. Avoid arbitrary numerical confidence claims.

**Acceptance:** decisions survive restart and re-analysis; dismissing a finding records its reason and source revision; duplicates are linked without discarding distinct issues; reopening preserves history. Ambiguous matches are surfaced instead of automatically suppressing a newly introduced bug.

**Dependencies:** feature 1's revision targeting; identity/migration design coordinated with feature 3. Extend [agent schemas](../apps/local/src/features/agents/schemas.ts), [agent store](../apps/local/src/features/agents/lib/agent-store.ts), [result validation](../apps/local/src/features/agents/lib/validate-results.ts), and [results UI](../apps/local/src/features/agents/components/review-results.tsx).

**Open decisions:** which states are user decisions versus computed observations; matching strategy; repository-local storage shape; treatment of legacy runs without finding IDs.

## 3. Review rounds and fix verification

**Outcome:** users immediately see what changed since their last pass and which issues still require attention.

**Starting point:** keep-mode rounds, new-review sync, note anchoring, completion retention for unchanged files, and old AI run history exist. At the original baseline, re-sync was constrained to the active working-tree review and captured branch/HEAD; feature 1 removes the shared-selection dependency while retaining branch/HEAD and revision checks.

**Scope:** compare rounds; preserve unchanged completion and reopen changed sections; connect repeated findings, moved code, fixes, and regressions. Present unresolved, apparently fixed, no longer applicable, or unverified outcomes with explanations. Preserve original evidence. Separate model assessment, execution evidence, and human confirmation. Extend re-sync to explicit IDs where appropriate without weakening revision checks.

**Acceptance:** fixing one of two findings leaves the other open; line moves do not manufacture duplicate issues; deleting code does not silently prove an issue fixed; unrelated edits do not reset all progress; an old job cannot resolve an issue in a newer round. Reintroduced issues can be reopened with provenance.

**Dependencies:** features 1–2; feature 5 for executable evidence. Begin with [workspace re-sync](../apps/local/src/features/workspace/lib/local-workspace.ts), [snapshot storage](../packages/review-core/src/db/local-store.ts), [note anchoring](../packages/review-core/src/features/history/note-anchors.ts), and [job/snapshot matching](../apps/local/src/features/agents/lib/job-snapshots.ts).

**Open decisions:** lifecycle across commits/branch changes; association between separate reviews; ambiguous issue matching; when automatic resolution may be suggested versus confirmed.

## 4. Agent workflow for fixing findings

**Outcome:** select findings, request fixes, inspect the edits, and verify the result without losing context.

**Starting point:** per-finding/all-findings prompts, CLI result exports, and an installable agent skill exist. They are not yet one persistent fix task.

**Scope:** hand off selected findings and human notes with review revision, evidence, constraints, and suggested checks. Record the task and which agent is handling it. Associate returned changes with the requested findings. Offer focused before/after review and flag unrelated edits. Preserve a manual copy/export path alongside optional direct local-agent integrations.

**Acceptance:** an agent gets the intended review even if the reader switches; a stale source revision is detected before edits are applied; cancellation or agent failure retains findings and task history; returned code is reviewable before being treated as accepted. Repository edits, commits, and pushes follow explicit user actions and chosen integration policy.

**Dependencies:** features 1–3; feature 5 for check results; feature 14 for optional isolated worktrees. Extend [fix prompt presentation](../apps/local/src/features/agents/components/fix-prompt.tsx), [prompt construction](../apps/local/src/features/agents/lib/validate-results.ts), [CLI review commands](../packages/cli/src/features/reviews/commands.ts), and [skill installer](../packages/cli/src/features/skills/install.ts).

**Open decisions:** supported agent adapters, completion protocol, direct-write versus isolated-worktree behavior, and how concurrent fixes touching the same code are scheduled.

## 5. Local tests and verification results

**Outcome:** review conclusions include reproducible execution evidence tied to the reviewed source.

**Starting point:** frozen static diagnostics and related-test discovery exist. Senslop does not yet offer the proposed general test/build/lint execution workflow. Frozen compiler diagnostics do not represent a complete dependency-installed production build.

**Scope:** run selected tests, typechecks, lint, builds, or project-defined checks; show commands, output, duration, exit status, and cancellation. Record revision, environment, dependency state, and artifacts. Where useful, compare base and changed revisions to separate pre-existing failures from regressions. Let an agent propose a focused regression test. Use an execution policy and suitable isolation; materializing uncommitted snapshots must include their actual content, not just checking out HEAD.

**Acceptance:** every result points to the code that actually ran; later edits cannot reuse a stale green check as current evidence; cancellation stops child work; an unavailable tool is distinct from a failing test; baseline failures are labeled; cleanup preserves the user's working tree. A passing targeted test does not claim complete correctness.

**Dependencies:** feature 1 for jobs/identity; feature 3 for verification linkage; features 14–15 for isolation and source/execution policy. Extend [analysis tools](../apps/local/src/services/analysis/snapshot-analysis.ts), [frozen context](../apps/local/src/services/analysis/frozen-context.ts), and [job execution](../apps/local/src/services/inngest/jobs.ts) rather than mixing execution into read-only source tools without a clear boundary.

**Open decisions:** execution permissions, dependency installation/cache behavior, supported environments, retention of logs, and resource/process isolation.

## 6. Hunk-level groups and completion

**Outcome:** review related behavior even when one file contains several independent changes.

**Starting point:** each changed file currently belongs to exactly one behavior group. File completion, original line/code notes, and diff rendering already exist.

**Scope:** represent review units as hunks or symbols with exact source ranges. Permit one file to participate in multiple flows while covering each intended changed region once. Keep definitions before uses and relevant tests after their implementation. Support manual rename/reorder/split/combine operations and derive file completion from its units. Preserve manual organization when relevant source remains unchanged.

**Acceptance:** a file containing folder-tracking and hotkey edits appears in the correct two flows without losing or double-counting changed lines; full-file context remains available; coverage survives a round comparison where feasible; stale units and moved code receive explicit handling. Generated/binary files have appropriate fallback units.

**Dependencies:** feature 3's identity/round rules; compatible migration for saved grouping results. Start with [grouping contracts](../apps/local/src/features/agents/schemas.ts), [grouping validation](../apps/local/src/features/agents/lib/validate-results.ts), [group presentation](../apps/local/src/features/agents/components/grouped-files.tsx), and [diff renderer](../apps/local/src/features/review/components/preview-diff.tsx).

**Open decisions:** unit boundaries, overlapping explanations versus unique completion ownership, note-to-unit links, and how users override model output.

## 7. Review against the original request

**Outcome:** determine whether the implementation delivers the behavior the user requested.

**Scope:** attach a prompt, acceptance criteria, bug report, or selected project documents. Break intent into traceable criteria. Connect each criterion to code, tests, and unanswered questions. Identify missing behavior and unexpected scope expansion. Show Implemented, Verified, Missing, and Unclear separately; finding code is not sufficient to call a requirement verified.

**Acceptance:** a missing acceptance criterion is surfaced even when code compiles; ambiguous requests remain explicit questions; requirements and conclusions are versioned with the review; external issue links are optional context, not a dependency on hosted PR infrastructure.

**Dependencies:** features 1, 5, and 18; feature 8 for reusable project policy. Extend the existing context and agent contracts after searching for equivalent request/document attachment behavior.

**Open decisions:** supported input formats, criterion editing, and treatment of conflicting requirements.

## 8. Repository rules and review profiles

**Outcome:** reviews reflect the project's standards and the user's chosen concerns.

**Scope:** load explicit project conventions and review instructions. Offer focused profiles for correctness, security, performance, accessibility, API compatibility, and migrations. Support combined/custom profiles and one-review overrides. Show which rule or profile led to a finding. Keep review instructions inspectable and separate source content from controlling instructions.

**Acceptance:** project and temporary settings have predictable precedence; the relevant rule is cited; toggling a profile changes intended coverage without silently claiming all other dimensions were checked; saved runs retain the settings used to produce them.

**Dependencies:** existing role/task settings; features 7 and 20. Current editable grouping instructions are a starting point, not a complete reusable profile system.

**Open decisions:** repository configuration format, precedence, inheritance for nested projects, and how unfamiliar or conflicting rules are reported.

## 9. Change impact and risk guidance

**Outcome:** direct attention to consequential changes with concrete explanations.

**Scope:** identify affected callers, dependencies, tests, exported interfaces, permissions, configuration, and persistence. Surface missing supporting changes. Explain why a region deserves attention and show supporting unchanged context. Distinguish inferred impact from compiler-resolved relationships; avoid an unexplained risk score.

**Acceptance:** an exported signature change leads to relevant callers/tests; an unresolved dependency stays labeled; guidance points to evidence; ranking is useful on a large mixed change without presenting speculative connections as facts.

**Dependencies:** existing frozen analysis, feature 6 for precise units, feature 11 for language expansion, and feature 20 for usefulness evaluation. Start with [snapshot analysis](../apps/local/src/services/analysis/snapshot-analysis.ts) and [file summaries](../apps/local/src/features/agents/components/file-summary.tsx).

## 10. Deeper navigation and diff tools

**Outcome:** explore large changes and supporting code without losing the review's place.

**Scope:** definition/reference/caller/test navigation in the frozen snapshot; source-content and symbol search; expandable unchanged context; whitespace controls; clear moved/renamed-code presentation; generated/repetitive-change handling; image and structured-data previews where supported. Navigation retains a back/forward trail and reading position.

**Acceptance:** a reference opens the correct frozen version rather than live disk; returning restores position; hiding repetitive changes remains discoverable and does not silently count them reviewed; unavailable binary previews have honest fallbacks.

**Dependencies:** current diff/search/context infrastructure; features 6 and 11. Preserve existing monospace paths, keyboard protections, accessibility, and user themes.

## 11. Broader language understanding

**Outcome:** more languages receive context quality comparable to JavaScript/TypeScript.

**Scope:** language-specific parsing, symbols, references, dependency resolution, diagnostics, and test conventions; mixed-language repositories; extensible adapters. Label full semantic, parsing-only, and text-only support. Reuse language tooling instead of claiming semantic accuracy from text matching.

**Acceptance:** representative fixtures establish what each adapter can resolve; missing dependencies/configurations appear as limitations; unsupported languages remain reviewable as text; one language adapter's failure does not invalidate unrelated files.

**Dependencies:** the current [analysis types](../apps/local/src/services/analysis/types.ts), [frozen compiler](../apps/local/src/services/analysis/frozen-compiler.ts), and [source capture](../apps/local/src/services/analysis/frozen-context.ts); feature 20 for per-language evaluation.

**Open decisions:** first additional languages, process/tool dependencies, distribution footprint, and adapter API.

## 12. Git operations inside the application

**Outcome:** finish local review and perform convenient Git actions without changing the product into a hosted review service.

**Starting point:** Git inspection currently reads changes. Staging, committing, fetching, pulling, and pushing from the UI are proposed additions, not enabled by existing inspection behavior.

**Scope:** separate staged/unstaged views; stage selected files/hunks; preview and create focused commits; show branch, upstream, remote, and ahead/behind state; fetch, pull, and push through existing Git authentication. Associate reviewed content with resulting commits. Present conflicts and recovery choices. Coordinate working-tree/index mutations with capture, checks, and agent edits.

**Acceptance:** a commit contains exactly the selected content; the push destination is visible; rejected/non-fast-forward pushes and pull conflicts are actionable; review snapshots survive Git operations; later unreviewed edits are not silently attributed to a reviewed commit. Existing uncommitted work is preserved during failed operations. Normal push/pull is the initial scope; destructive history rewriting is not implied.

**Dependencies:** feature 1's operation coordination and feature 3's freshness identity. Reuse [shared Git infrastructure](../packages/review-core/src/features/git/repository.ts) with a distinct mutation boundary; extend CLI/API/UI consistently.

**Open decisions:** pull policy, conflict UI, commit hooks, signing, and explicit handling of changed upstream/remote state.

## 13. Optional checkpoint before pushing

**Outcome:** see whether outgoing code is actually covered by the local review.

**Scope:** compare outgoing commit content with reviewed revisions. Show unresolved findings, unreviewed sections, missing checks, and changes introduced since completion. Offer a configurable pre-push integration and an explicit override with a reason. Keep it optional and usable from both app-initiated and ordinary terminal pushes.

**Acceptance:** later edits invalidate the appropriate coverage; multiple outgoing commits are evaluated accurately; a locally recorded override is visible; turning the checkpoint off restores normal workflow. Completing one review never silently approves later content.

**Dependencies:** features 3, 5, and 12. Decide exact content/commit lineage matching before presenting an overall readiness result.

## 14. Workspace for multiple projects and worktrees

**Outcome:** switch local projects and isolated agent workspaces without mixing their context.

**Scope:** project switcher, recent reviews, project-specific preferences, root/worktree/branch/launch-folder identification, dedicated reading tabs/windows, and optional worktree management. Show activity through feature 1's job/status system rather than inventing a competing queue. Worktree-aware isolation can support fixes and verification.

**Acceptance:** two branches in separate worktrees retain correct source and history scope; a project switch preserves reading state; nested folders retain the correct folder metadata; deleting or losing an external worktree leaves saved review evidence readable where captured.

**Dependencies:** feature 1; source materialization requirements from features 4–5. A worktree checked out at HEAD alone does not reproduce unstaged/untracked snapshot content.

**Open decisions:** preference scopes, worktree ownership/cleanup, shared Git metadata coordination, and which windows an explicit Open action targets.

## 15. Source and model access controls

**Outcome:** users understand and control what code and credentials each workflow uses.

**Starting point:** local review storage, bounded capture, secret exclusions, loopback capabilities, OS credential storage, and local/remote provider choices exist.

**Scope:** repository/folder inclusion policies; inspectable selected context; visible provider routing per task; repository policies requiring local inference; configurable history/log retention; data export/deletion; diagnostic bundles that omit credentials and source unless deliberately included. Preserve policy when fallback models or agent integrations are used.

**Acceptance:** excluded context does not re-enter through a secondary tool; a local-only policy prevents remote fallback; previews distinguish locally stored data from outbound context; exports/logs do not reveal stored credentials; policy changes have defined effects on existing snapshots.

**Dependencies:** capture, providers, and credential services; coordinate with features 4–5 and 16. Avoid claiming zero source transmission merely because the UI runs locally.

## 16. Visible cost and resource controls

**Outcome:** users choose an appropriate depth of analysis and understand its resource use.

**Scope:** measured token usage, duration, and estimated cost where pricing is reliable; per-review budgets/time limits; quick/thorough modes with stated coverage differences; reuse of unchanged analysis; explicit skipped/deferred work when a budget is reached. Execution concurrency and shared quotas belong to feature 1; this feature owns their user-visible budgets and accounting.

**Acceptance:** unavailable pricing stays unknown rather than zero; estimated charges remain separate from measured usage; retries and context calls are included; exceeding a budget preserves completed work and explains remaining coverage; cached analysis is reused only when its source/settings provenance is compatible.

**Dependencies:** existing [capacity settings](../apps/local/src/features/ai-capacity/schemas.ts), [request limiter](../apps/local/src/services/ai/request-limiter.ts), and [AI diagnostics](../apps/local/src/services/ai/diagnostics.ts), plus feature 1.

## 17. Useful project memory

**Outcome:** explicit reviewer decisions improve future reviews without hiding fresh bugs.

**Scope:** remember accepted patterns and intentional exceptions; let users promote a decision into a repository rule; record provenance, scope, and revision; support editing/removal; separate repository knowledge from global preferences. A one-time dismissal does not automatically become permanent suppression.

**Acceptance:** users can explain why a rule exists and remove it; memory does not leak between projects; changed assumptions allow a finding to reappear; stored knowledge is subject to the same source/model access policy as other context.

**Dependencies:** feature 2's decisions, feature 8's rules, and feature 15's policy. Automatic rule learning is an open choice, not an approved default.

## 18. Complete review report

**Outcome:** a review has a readable, durable outcome that can be revisited or handed to an agent.

**Scope:** combine human notes, AI findings/decisions, requirement coverage, checks, unresolved questions, and limitations. Record exact source revision, model/settings provenance, and completion state. Export readable HTML and structured JSON, with a focused handoff for remaining work. Keep older round reports available.

**Acceptance:** a report distinguishes unreviewed code, unverified conclusions, failed checks, and resolved issues; links point to the right frozen evidence; exports remain useful without exposing credentials; later rounds do not rewrite a previous report's claimed source.

**Dependencies:** existing notes, fix prompts, and exports; features 2–5 and 7. Human notes alone are not the same as the current AI-generated fix-all prompt.

## 19. Everyday usability and distribution

**Outcome:** reaching a useful review and returning to it are easy, predictable operations.

**Scope:** first-run path from installation to a real review; project/provider setup; reading-position, panel/filter/search persistence; customizable shortcuts; command palette; focused reading mode; notification preferences; draft-preserving retries; cross-platform updates and useful diagnostics. Keep the current buddy optional and configurable. Preserve existing themes, monospace paths, accessible controls, and input-aware hotkeys.

**Acceptance:** a clean install can reach an ordinary review without a cloud account or AI configuration; setup explains optional inference; reconnect/restart restores supported state; shortcut customization does not steal typing; updates preserve saved data and have a defined compatibility/migration policy.

**Dependencies:** existing CLI packaging and UI preferences; feature 1 for independent reading state; feature 15 for diagnostic contents. Treat work as small targeted improvements rather than a simultaneous redesign.

## 20. Measured review quality

**Outcome:** demonstrate improvements in useful review results as capabilities grow.

**Scope:** maintain known-bug and clean-change examples; measure missed bugs, false positives, duplicates, evidence accuracy, latency, and cost. Compare models/instructions on reproducible inputs. Include multiple languages, large mixed changes, misleading source content, and repeated rounds. Evaluate grouping usefulness and fix-verification outcomes as well as raw finding counts.

**Acceptance:** the evaluation corpus has expected outcomes and provenance; reports separate deterministic contract checks from model-dependent judgments; regressions are visible; clean changes can pass without invented findings. Live-provider evaluations are explicit opt-in runs and do not turn ordinary tests into paid requests.

**Dependencies:** build on existing agent/analysis tests; expand alongside each feature. User decision data is not collected for evaluation without a defined local policy. Thresholds and model promotion criteria remain open decisions.

## Recommended delivery sequence

This is a suggested sequence, not a deadline estimate or a commitment to touch all features now.

1. **Reliable background preparation:** feature 1 identity, activation separation, caller folder capture, list status, and explicit opening. Verify two-terminal and uninterrupted-reading behavior before adding scheduling refinements.
2. **Track issues through a fix:** feature 2 decisions, feature 3 round comparison, feature 4 handoff, and a narrow feature 5 verification path. Start feature 20 evaluations at the same time.
3. **Improve review precision:** feature 6 hunk units, then features 7–10 for intent, rules, impact, and navigation.
4. **Complete the local development workflow:** feature 12 Git conveniences, feature 13 optional checkpoint, and feature 14 project/worktree UX, using the identity and verification work already delivered.
5. **Expand deliberately:** feature 11 languages and features 15–19 controls, memory, reports, and usability. Incorporate necessary privacy/resource controls earlier when direct execution or agent writes are introduced.

The first major milestone is complete when a developer can prepare B while reading A, identify and decide on issues in B, hand selected issues to an agent, capture the resulting edits, run relevant checks against the correct source, and review the remaining issues without losing either review's context.

### Suggested small chunks for feature 1

Refine these boundaries against current code before implementation. Keep each chunk independently testable and generally under ten files; share contracts with both server and CLI as needed rather than forcing an arbitrary split.

| Chunk                         | Result                                                                                               | Verification                                                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A: Capture without activation | Persist a new review without changing the active reader; retain an explicit existing activation path | Persistence/API tests show A stays active while B is created; old explicit-open behavior remains available   |
| B: Explicit caller context    | CLI sends the effective folder and receives/uses review revision and job IDs                         | Two subfolders, explicit `--repo`, invalid folder, and follow-up-by-ID scenarios                             |
| C: Background list state      | History exposes persisted work status without requiring each review to be opened                     | Queued/preparing/ready/failed/canceled states and readable snapshot with optional-analysis failure           |
| D: Independent view           | Explicit Open with defined tab targeting; preserve drafts and position; notifications deferred       | A remains unchanged while B completes; user-triggered Open reaches B                                         |
| E: Scheduling and recovery    | Extend existing deduplication/cancellation/retry/priority and cross-workspace limits                 | Bounded demand, cancellation, restart recovery, duplicate dispatch, stale results, and provider contention   |
| F: Instance reuse and races   | Friendly repeated startup and reliable owner/session cleanup                                         | Simultaneous startup, stale records, occupied saved port, and old-owner cleanup cannot disrupt a replacement |

Chunks A–D establish the central UX. Existing protections in E–F must remain intact throughout; strengthen them when testing exposes gaps. Re-sync now targets explicit review revisions and no longer depends on the shared default selection. Completion notifications from the original suggestion remain deferred.

## Code map for future work

Paths are relative to this document; recheck them after refactors.

| Responsibility                     | Starting locations                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI commands and machine output    | [command catalog](../packages/cli/src/features/commands/definitions.ts), [review operations](../packages/cli/src/features/reviews/commands.ts), [job waiting](../packages/cli/src/features/reviews/jobs.ts)                                                                                                                                                                                                                   |
| App/engine lifecycle and discovery | [app launcher](../packages/cli/src/features/workspace/local-app.ts), [engine lifecycle](../packages/cli/src/features/workspace/local-jobs.ts), [session records](../packages/cli/src/features/workspace/workspace-session.ts), [client](../packages/cli/src/features/workspace/workspace-client.ts), [runtime paths](../packages/cli/src/features/workspace/runtime-paths.ts)                                                 |
| Shared review contracts            | [saved review](../packages/contracts/src/local-review.ts), [workspace presentation types](../apps/local/src/features/workspace/types.ts)                                                                                                                                                                                                                                                                                      |
| Local capture, selection, sync     | [workspace service](../apps/local/src/features/workspace/lib/local-workspace.ts), [server workspace](../apps/local/src/features/workspace/lib/server-workspace.ts), [workspace API](../apps/local/src/app/api/workspace/route.ts), [local store](../packages/review-core/src/db/local-store.ts)                                                                                                                               |
| AI jobs and revision checks        | [agent store](../apps/local/src/features/agents/lib/agent-store.ts), [schemas](../apps/local/src/features/agents/schemas.ts), [matching](../apps/local/src/features/agents/lib/job-snapshots.ts), [dispatch](../apps/local/src/services/inngest/functions.ts), [execution](../apps/local/src/services/inngest/jobs.ts)                                                                                                        |
| Frozen code analysis               | [source capture](../apps/local/src/services/analysis/frozen-context.ts), [analysis/tools](../apps/local/src/services/analysis/snapshot-analysis.ts), [compiler](../apps/local/src/services/analysis/frozen-compiler.ts)                                                                                                                                                                                                       |
| Model analysis and capacity        | [repository agent](../apps/local/src/services/ai/repository-agent.ts), [provider runtime](../apps/local/src/services/ai/provider-runtime.ts), [limiter](../apps/local/src/services/ai/request-limiter.ts), [diagnostics](../apps/local/src/services/ai/diagnostics.ts)                                                                                                                                                        |
| Reader and history UI              | [workspace](../apps/local/src/features/review/components/review-workspace.tsx), [live preview state](../apps/local/src/features/review/components/live-preview-provider.tsx), [toolbar](../apps/local/src/features/workspace/components/workspace-toolbar.tsx), [history](../apps/local/src/features/workspace/components/review-history.tsx), [updates](../apps/local/src/features/workspace/hooks/use-workspace-updates.ts) |
| Findings, chat, grouping, handoff  | [results](../apps/local/src/features/agents/components/review-results.tsx), [chat](../apps/local/src/features/agents/components/agent-chat.tsx), [groups](../apps/local/src/features/agents/components/grouped-files.tsx), [fix prompts](../apps/local/src/features/agents/components/fix-prompt.tsx), [validation](../apps/local/src/features/agents/lib/validate-results.ts)                                                |
| Notes and preferences              | [notes](../apps/local/src/features/review/components/review-notes.tsx), [anchoring](../packages/review-core/src/features/history/note-anchors.ts), [preferences](../apps/local/src/features/settings/schemas.ts), [shared hotkey hook](../packages/ui/src/hooks/use-keyboard-shortcuts.ts)                                                                                                                                    |

## Verification and maintenance

### Baseline evidence

During the discussion, 22 existing tests passed across local worker/port behavior, authenticated client discovery, and the agent store. Earlier verification of the committed improvements passed 154 targeted tests, local/UI/web/test TypeScript checks, and local/UI lint with two existing generated-component warnings. These are historical results, not certification of the proposed roadmap or evidence that future changes still pass. Some CLI tests need loopback permission; a sandbox `listen EPERM` requires a permitted rerun, not an application workaround.

No roadmap feature implementation or new live-provider evaluation was performed when this file was created. Use focused verification appropriate to the selected changes. Consult package scripts before invoking commands, and stop app/test processes you start.

### Useful existing commands

Run from the repository root after inspecting current scripts and environment requirements:

```sh
pnpm dev:local
pnpm exec vitest run packages/cli/src/features/workspace/tests/local-jobs.test.ts packages/cli/src/features/workspace/tests/workspace-client.test.ts apps/local/src/features/agents/tests/agent-store.test.ts
pnpm --filter @senslop/local exec tsc --noEmit
pnpm --filter @senslop/ui typecheck
pnpm --filter @senslop/web exec tsc --noEmit
pnpm exec tsc --project tsconfig.tests.json --noEmit
pnpm --filter @senslop/local lint
pnpm --filter @senslop/ui lint
```

The first command starts the app and must be stopped if you start it for verification. The other commands are examples of existing checks, not a requirement to run all of them for documentation-only edits. Packaging, cross-platform, isolated-execution, and live-provider claims need their own evidence.

### Definition of done for an implemented feature

- Accepted behavior and open decisions are reflected in the relevant PRD/spec sections.
- CLI, API, persisted state, UI, and agent skill/help agree where the feature crosses those boundaries.
- Migration preserves legacy records, and failure/cancellation/restart/concurrent-edit behavior is defined where relevant.
- Meaningful behavioral checks and applicable type/lint/build checks pass; unverified scenarios are disclosed.
- Progress in this roadmap records concrete evidence and current limitations. “Extend” or a ticked box alone is insufficient proof of completion.
- Added/renamed authored files use lowercase kebab-case, formatting is checked, and a flow-based review guide covers the change.
- Any requested commits are grouped by feature with mixed-file hunks separated, following repository commit-message conventions. Publishing, pushing, or changing repository visibility follows the user's authorization for that action.

### Progress record

At document creation, all 20 entries were future roadmap features. Feature 1 was subsequently approved and implemented with the owner changes recorded above; features 2–20 remain future work. For each future implementation, record the feature/chunk, date, commits if created, acceptance scenarios exercised, commands/results, and remaining open decisions. Reinspect the implementation before relying on the baseline.

### Feature 1 implementation evidence — October 24, 2026

- Implemented the approved feature across persistence, CLI/API, independent readers, history status, queue controls, shared capacity, and ownership. The first review opens automatically; later captures stay in the background unless explicitly opened. Completion notifications and a daemon remain deferred. Implementation commits: `bf80719` for durable jobs/shared capacity, `da0809b` for concurrent review clients and independent readers, and `b3e3a65` for compact history icons/actions and loading presentation. Documentation and contribution rules are committed separately.
- Behavioral coverage: 214 changed-area tests passed across 16 executed files. All three opt-in packaged integration tests also passed, exercising background clients, explicit re-sync, and real-engine pending-job restart recovery. New tests cover concurrent capture and folder membership, revision conflicts, reader draft/focus retention, distinct re-analysis versus retry checkpoints, dispatch recovery, separate-process capacity, and simultaneous owner election.
- Commit preparation rechecked 231 focused tests across job execution, reader/client isolation, and history/agent UI. All passed, including seven loopback-server tests rerun outside the restricted sandbox. Local and CLI TypeScript checks also passed.
- Production Next.js and CLI builds passed. Local/CLI/test TypeScript checks, shared UI and hosted-web compatibility typechecks, and local/CLI lint passed. Formatting, diff whitespace, and all added filenames were checked.
- Broader regression run: 1,007 tests passed and one unrelated buddy keyboard-preview assertion failed, including in isolation. The failure expects “Momo preview” after ArrowDown in `apps/local/src/features/buddy/tests/buddy-settings.test.tsx`; buddy code was not changed in this pass. Ten opt-in tests were skipped in that run.
- Limits: deterministic loopback inference verifies orchestration, not real-model quality or paid-provider quotas. A fresh archive install, additional operating systems, and full manual acceptance checks were not performed. The compact history layout and keyboard tooltips were checked in the existing Chrome app. Independent-reader retention is covered by automated DOM tests. Separate data directories and requests outside Senslop remain independent capacity namespaces.

## Primary references

- [Inngest concurrency](https://www.inngest.com/docs/durable-execution/flow-control/concurrency): executing steps, keyed limits, and queued work. This informs feature 1; do not equate step limits with a machine-wide model-request limit.
- [Git worktrees](https://git-scm.com/docs/git-worktree): separate working trees and shared repository metadata, informing features 5 and 14.
- [Git push](https://git-scm.com/docs/git-push) and [Git pull](https://git-scm.com/docs/git-pull): destination/upstream semantics and update behavior, informing features 12–13. Check current official guidance again when implementing.
- [TanStack input handling research](tanstack-hotkeys-input-research.md): native typing protections used by the current shared shortcut hook; preserve them when extending shortcuts.
