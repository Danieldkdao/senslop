---
doc: checklist
status: current-baseline
last-reconciled: 2026-10-26
implementation-baseline: 6d3fde6
---

# Senslop — Implementation and Verification Ledger

## How to use this document

This ledger replaces the historical hosted-upload build slices and append-only progress notes. [Scope](scope.md), [PRD](prd.md), and [spec](spec.md) describe current behavior. The [roadmap](local-review-roadmap.md) records approved implementation scopes, delivery history, and remaining release work; dated historical sections do not override the current status below.

“Present in code” below means the implementation was inspected. It does not mean every scenario passed a fresh test or human check in this documentation pass. Record the commands, revision, environment, and observed result when performing verification. Keep personal learning context in the private learner profile.

## Current status — October 26, 2026

All 20 roadmap features have their approved implementation scopes present. Groups 1–2 are merged; the daily-workflow delivery and UI/runtime refinements are committed on `feat/finish-daily-workflow` through `738af5b`. The 49-topic-commit split accounted for all 211 changed paths without changing file contents and left a clean working tree. Publication and full release/platform/provider acceptance remain open.

Recorded verification at the original `738af5b` source baseline follows; the [review-findings follow-up](#review-findings-follow-up--october-26-2026) records the newer fixes and test results:

| Check                                                                | Observed result                             | Boundary                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary `pnpm test` plus permitted loopback rerun                   | 1,363 unique passing tests, 13 opt-in skips | The restricted full run had 1,347 passes and 16 listener-permission failures; the four affected files reran successfully with 18 passes and one skip, including two already-passing tests |
| `pnpm --filter @senslop/local typecheck` and test-project TypeScript | Passed                                      | Local app and test compilation; not every hosted workspace rechecked in this pass                                                                                                         |
| Changed-area ESLint, Prettier, and `git diff --check`                | Passed                                      | Covers the latest changed code; earlier repository-wide results remain separately dated below                                                                                             |
| Local production build and CLI bundle build                          | Passed                                      | Turbopack required permitted worker sockets and a fresh production cache after a cached sandbox failure                                                                                   |
| Disposable browser fixture                                           | Passed                                      | Compact progress with 40 paths; real task Apply showed pending/success toasts, changed the fixture source, and advanced the review round                                                  |
| Long-running subscription/Gateway adapter fixtures                   | Passed                                      | Covers streamed transport, nine-minute active responses, initial quiet reasoning, stalls, cancellation, and incomplete completion; no new live provider calls                             |

These results were recorded before this documentation-only update, not rerun by editing prose. Earlier clean-archive, independent-process, live synthetic Google, and browser checks retain their own dates below and in the roadmap. No release, every-platform, or universal provider compatibility claim follows from the fixture suite.

The loopback rerun used `pnpm exec vitest run apps/connection-server/tests/server.test.ts packages/cli/src/features/workspace/tests/local-app.test.ts packages/cli/src/features/workspace/tests/local-jobs.test.ts packages/cli/src/features/workspace/tests/workspace-client.test.ts`. Latest build commands were `pnpm --filter @senslop/local build` and `pnpm --filter @senslop/cli build`; live services started for the browser fixture were stopped.

## Implemented foundations

| Area                   | Present in code                                                                                                                           | Relevant evidence location                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Local runtime          | CLI-owned Next app, local engine, private sessions, one owner per root/data namespace, alternate port when unowned saved port is occupied | packages/cli/src/features/workspace and its tests                 |
| Command clients        | Authenticated discovery, structured reads/mutations, explicit IDs, lifecycle commands, help catalog                                       | packages/cli/src/features/commands; workspace-client tests        |
| Git sources            | Browser/CLI working-tree, commit, endpoint-range, and branch inspection; bounds/exclusions/binary metadata                                | packages/review-core/src/features/git; local-workspace tests      |
| Persistence/history    | Local reviews, notes, selection/completion, folder search/grouping, legacy metadata, reopen/rename/delete                                 | LocalStore history tests; workspace history UI tests              |
| Reading UI             | Diffs, search/navigation, file completion, notes/line comments, responsive panels                                                         | apps/local/src/features/review/tests                              |
| AI preparation         | Grouping, summaries, related-file order, captured context, preparation/retry/fallback UI                                                  | agents UI tests; services/ai and services/inngest tests           |
| AI interaction         | Source-aware chat, selection explanations, correctness findings/evidence, saved runs/conversations, fix prompts                           | agents and AI service tests                                       |
| Re-sync                | Keep/new modes, round identity, unchanged completion, notes/original references, stale-result rejection                                   | local-workspace, history, resync-workspace, and agent-store tests |
| Providers              | Metadata checks, persistent feedback, model discovery/pickers, compatible configuration, subscription flows                               | providers and subscriptions tests                                 |
| Settings/appearance    | Saved editor/application/buddy preferences, live diff preview, header actions, autosave, native input-aware hotkeys                       | settings/provider/buddy tests; root shared-hook tests             |
| Agent operations       | CLI review/run/note/settings/provider parity and bundled skill installer                                                                  | packages/cli/tests/agent-workflow.test.ts and installer tests     |
| Finding/task lifecycle | Durable decisions, immutable rounds, manual agent handoff, returned-edit review/application, and exact-revision verification              | workflow modules and tests in local app/review-core               |
| Explicit checks        | Managed source materialization, commands, output/artifacts, cancellation, exact-input evidence, and large unchanged asset streaming       | execution-manifest/check-runner/fix-changes tests                 |
| Precision review       | Region ownership, intent/criteria, profiles/rules, impact, frozen navigation, Python/Go parsing, and optional LSP                         | precision and analysis modules/tests                              |
| Daily Git              | Guarded staging/commits/fetch/fast-forward pull/push, conflicts, outgoing coverage, and preserving pre-push hooks                         | git-workflow and CLI checkpoint tests                             |
| Project memory/reports | Scoped explicit guidance with provenance and immutable policy-filtered round exports                                                      | memory/reports modules and tests                                  |
| Notifications/updates  | Opt-in category delivery with atomic claims, About/diagnostics, update checks, and guarded installation                                   | notification, update-service, and local-app tests                 |
| Workflow UI            | Full-width tabs, flat animated disclosures, actionable verification, output controls, toasts, and finished-history hiding                 | workflow and workspace-chrome tests                               |
| Source responsiveness  | Isolated frozen-analysis worker, deferred scheduling, stale-request guards, early cancellation, and first-frame buddy rendering           | source-analysis, state-route, preview, and buddy tests            |
| Quality evaluation     | Declared deterministic corpus, saved comparisons, and opt-in live findings/grouping harness                                               | evaluations modules and tests                                     |
| Hosted foundation      | Separate auth/OTP/device routes and presence code; placeholder dashboard                                                                  | apps/web and apps/connection-server tests                         |

## Current limits and deferred work

- Desktop completion notifications are opt-in; the owner app and a browser tab must remain running.
- Concurrent clients share the convenience `current`; explicit IDs and expected hash/round are the reliable automation target.
- Machine/provider capacity is coordinated within the shared application-data namespace; outside clients and separate data directories remain independent.
- Automatic external-agent launch adapters remain future work; authorized selected fixes, local checks, Git operations, and consolidated reports are implemented.
- Strong compiler-backed analysis centers on JavaScript/TypeScript; Python/Go parsing and optional semantic tools retain explicit limitations.
- CLI publishing, supported-platform readiness, real subscription/provider compatibility, and model accuracy require evidence beyond source fixtures.

See [roadmap features 1–20](local-review-roadmap.md#feature-overview) for detailed targets and acceptance criteria.

## Feature 1 implementation — October 24, 2026

The owner approved background creation with automatic opening for the first review, explicit --open thereafter, and independent browser tabs. Implemented caller-folder capture, revision checks, persisted history status, queue cancellation/retry/priority, shared model admission, restart guards, and transactional owner/session cleanup. Completion notifications were deferred at that checkpoint and are now implemented in Group 3. Implementation commits separate durable jobs/shared capacity, concurrent review workflows, and compact history UI; the roadmap records their IDs. The new packaged background-workspace fixture passed against the real local engine without paid inference. Final regression counts and limitations are recorded in the roadmap progress record.

## Historical verification evidence — October 24, 2026

The following results were observed during the preceding work at the older baseline `0860767`. They are not new executions in this documentation pass and should not be presented as current certification after code changes.

| Evidence                                                                | Recorded result                                                                         | Limits                                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Targeted review/history/settings/provider/hotkey/CLI environment suites | 154 tests passed                                                                        | Deterministic/fixture coverage, not a live model-quality or every-platform test |
| Local/UI/web/test TypeScript checks                                     | Passed                                                                                  | Typechecks do not prove runtime behavior                                        |
| Local/UI lint                                                           | Zero errors; two existing generated-component effect warnings in UI                     | Existing carousel/use-mobile warnings were not introduced by this work          |
| Worker ports/session discovery/agent store                              | 22 tests passed                                                                         | Loopback tests needed permitted socket access after sandbox EPERM               |
| File-preserving split commits                                           | 50 original changed files committed with identical content across seven feature commits | Verified the staged split, not a new package installation                       |

Earlier auth, transport, packaging, and browser experiments are recorded in previous revisions of this file in Git history. Preserve that provenance; do not copy old counts into a claim that the current full suite or production journey just passed.

## Verification tasks for the next code change or release

Check items only after recording real evidence at the intended revision.

- [ ] Run focused behavior tests for the selected changes, including failures/concurrency/restart when applicable.
- [ ] Run applicable package and test typechecks, lint, formatting, and production build checks.
- [ ] Exercise clean archive installation outside the monorepo and the intended Git sources, assets, persistence, and shutdown behavior.
- [ ] Exercise independent CLI processes against the built app/engine with deterministic providers.
- [ ] Validate intended live model/provider/subscription paths with legitimate configured accounts; record unsupported/unverified combinations.
- [ ] Validate OS credential behavior on each claimed supported platform; preserve no-plaintext-fallback behavior.
- [ ] Perform human browser exploration of grouping, diffs, notes, chat/explanation, correctness evidence, saved history, and eligible re-sync.
- [ ] Check narrow layouts, keyboard use, focus, settings header actions, preference persistence, buddy controls, and reduced motion.
- [ ] Inspect any intended publication for private data, credentials, licensing, and included history. Publishing requires the appropriate user authorization.
- [ ] Confirm the exact release/submission materials separately; the roadmap is not the submission checklist.

## Useful existing verification commands

Choose checks appropriate to the change and consult current package scripts first.

```sh
pnpm exec vitest run packages/cli/src/features/workspace/tests/local-jobs.test.ts packages/cli/src/features/workspace/tests/workspace-client.test.ts apps/local/src/features/agents/tests/agent-store.test.ts
pnpm exec vitest run tests/use-keyboard-shortcuts.test.tsx apps/local/src/features/workspace/tests/review-history.test.tsx apps/local/src/features/settings/tests/settings-dialog.test.tsx
pnpm --filter @senslop/local exec tsc --noEmit
pnpm --filter @senslop/ui typecheck
pnpm --filter @senslop/web exec tsc --noEmit
pnpm exec tsc --project tsconfig.tests.json --noEmit
pnpm --filter @senslop/local lint
pnpm --filter @senslop/ui lint
```

Source behavior checks and opt-in process/package checks serve different purposes:

```sh
SENSLOP_AGENT_TEST=1 pnpm exec vitest run packages/cli/tests/agent-workflow.test.ts
SENSLOP_PACK_TEST=1 pnpm exec vitest run packages/cli/tests/packaged-workspace.test.ts
RUN_LOCAL_DEV_TESTS=1 pnpm exec vitest run packages/cli/src/features/workspace/tests/local-app.test.ts
RUN_OS_CREDENTIAL_TESTS=1 pnpm exec vitest run apps/local/src/services/credentials/tests/os-credentials.test.ts
```

Inspect each test's prerequisites first. The agent/process test uses a built bundle, isolated data/repositories, and a deterministic loopback provider; it does not measure real model quality. Socket restrictions are an environment issue to resolve through permitted execution, not by weakening application behavior.

## Final Review

A fresh release-level human review has not been completed as part of this documentation refresh. Record user findings and resolved refinements here when performed.

- [ ] Human exploration and agreed feedback recorded at the release revision.
- [ ] Required refinements implemented and verified.
- [ ] Owner confirms the intended build is ready for its next release/submission.

## Code Tour and App Map

The historical guided-learning wrap-up was not established by this documentation task. `devpost/app-map.html` is not currently present. A focused architecture trace or other owner-chosen learning activity can be recorded when actually performed; no completion is inferred from documentation alone.

- [ ] Record the selected learning activity or an explicit owner decision about it.
- [ ] If an app map is requested, generate it from current paths and verify it.

## Documentation reconciliation — October 24, 2026

The current-state refresh audits repository code, CLI command definitions, manifests, and document references. It replaces obsolete cloud-review instructions and distinguishes current implementation, historical test evidence, and proposed roadmap work. It changes documentation only. Record link/format verification for this pass in the final task response; do not mark runtime/release checks complete because prose was updated.

## Finish the daily workflow — October 25, 2026

Group 3 implements features 12, 13, 17, 18, and 19 plus the approved notification/update behavior. The roadmap records behavioral decisions and evidence; the implementation and follow-up refinements are now committed on `feat/finish-daily-workflow`. Publishing and upgrades to a future published release are deferred. Customizable keyboard shortcuts are excluded from the first version, and `/ai-test` is removed.

Manual tests use a disposable repository and isolated data with allowed cheap providers only. The live Google Flash-Lite flow found an intentional null-cart bug, accepted/promoted it, returned an isolated fix, inspected/applied it in the browser, re-synced the round, passed the regression check, and obtained an apparently-fixed assessment. This validates that flow on macOS, not every provider or platform.

At the October 25 checkpoint: 1,292 passing tests with 13 opt-in skips; successful typecheck, lint, and production build; separately passing clean-archive and independent-CLI suites; Chrome notification permission/category, draft, focus/commands, update cancellation/diagnostics, report/evidence/export, and Git flows. A local bare remote verified checkpoint blocking, an explicit override, and existing-hook restoration. The roadmap has the detailed evidence and limits. Test-owned runtime processes were stopped; publishing, future published-version installation, and non-macOS execution remain unchecked.

## Documentation reconciliation — October 26, 2026

Scope, PRD, spec, roadmap, and both README files are reconciled against `738af5b`, package scripts, CLI help, runtime/capture constants, and the recorded verification above. The refresh updates source/development setup, SQLite v8, execution streaming, notification claims, timeout policies, Work history, UI behavior, and committed delivery status; dated research and the private onboarding profile remain historical.

Validation for this documentation pass uses formatting, relative-link/anchor checks, CLI-help checks, and a dry run of the local build task graph; it does not start the app, invoke inference, or claim a new acceptance-suite run. Record the result in the final task response and commit the documentation after review.

## Review findings follow-up — October 26, 2026

All 17 reported findings were confirmed through failing regression cases before the fixes. The fixes are committed through source baseline `6d3fde6`; the two pre-existing matching favicon edits have their own asset commit.

| Issue | Confirmed defect and resulting behavior                                                                                                                               | Fix commit |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1     | Checkpoint finding lookup no longer depends on one review/hash; unresolved findings match exact outgoing content across reviews and archived rounds.                  | `0470318`  |
| 2     | Binary check evidence compares hashes and uses `afterHash` to identify deletion.                                                                                      | `0470318`  |
| 3     | Git blob digests stream large unchanged assets without the previous 25 MiB buffer limit.                                                                              | `0470318`  |
| 4     | New destination branches without historical checking compare the complete tip tree with the empty tree.                                                               | `0470318`  |
| 5     | Outgoing inspection uses the push URL, and fetch-side tracking refs cannot suppress a new destination's history checks; multiple push URLs require explicit handling. | `0470318`  |
| 6     | Whole-file rename unstaging restores both the old and new index paths.                                                                                                | `00f7ac7`  |
| 7     | Project memory origins resolve across worktrees of the same common Git project and reject unrelated projects.                                                         | `3c42eea`  |
| 8     | Queued memory autosaves use the returned version after an earlier save, including after settings unmount.                                                             | `ffef785`  |
| 9     | Verification report items retain evidence paths and honor current policy in new, saved, and legacy pathless reports.                                                  | `012a9b3`  |
| 10    | Reports use the analysis job's captured brief or inherit the applicable earlier-round brief.                                                                          | `012a9b3`  |
| 11    | Report selection resets on review/revision changes and report queries validate review ownership.                                                                      | `c196083`  |
| 12    | Update installation detection resolves global executable symlinks.                                                                                                    | `051a98a`  |
| 13    | Exact-object pushes set tracking for the local branch after success.                                                                                                  | `00f7ac7`  |
| 14    | Failed notification delivery explicitly retries an unchanged event feed.                                                                                              | `6e119cb`  |
| 15    | Valid notification Work-tab parameters override persisted tab state.                                                                                                  | `7f19be5`  |
| 16    | Notification claims expire, renew during delivery, and become completed only after browser submission is acknowledged.                                                | `6e119cb`  |
| 17    | Saved view state restores after a matching hydration render without replacing server content.                                                                         | `d979d42`  |

Verification executed for this follow-up:

- Focused regressions used disposable real Git repositories/check worktrees, SQLite stores/connections, deferred autosaves, browser component tests, and actual server rendering/hydration; each reported failure mode was observed before its fix.
- The full ordinary `pnpm test` run recorded 1,368 passes, 13 skips, and 16 sandbox-only `listen EPERM` failures across the four loopback integration files. Re-running those four files with localhost access passed all 18 active tests and one opt-in skip; two tests overlap the first run, giving **1,384 unique passing tests and 13 skips** overall.
- The permitted rerun used `pnpm exec vitest run apps/connection-server/tests/server.test.ts packages/cli/src/features/workspace/tests/local-app.test.ts packages/cli/src/features/workspace/tests/local-jobs.test.ts packages/cli/src/features/workspace/tests/workspace-client.test.ts`.
- `pnpm --filter @senslop/review-core typecheck`, `pnpm exec tsc --project apps/local/tsconfig.json --noEmit`, and `pnpm exec tsc --project tsconfig.tests.json --noEmit` passed. Changed-file ESLint, Prettier, filename checks, and `git diff --check` complete the static verification.
- No live provider inference, system notification banner check, or new production/package build was performed; earlier build/live evidence remains separately dated. Tests clean up their disposable runtimes, and no development app was started for this follow-up.
