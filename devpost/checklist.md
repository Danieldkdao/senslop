---
doc: checklist
status: current-baseline
last-reconciled: 2026-10-24
implementation-baseline: 0860767
---

# Senslop — Implementation and Verification Ledger

## How to use this document

This ledger replaces the historical hosted-upload build slices and append-only progress notes. [Scope](scope.md), [PRD](prd.md), and [spec](spec.md) describe current behavior. The [roadmap](local-review-roadmap.md) holds proposed work, not delivered functionality.

“Present in code” below means the implementation was inspected. It does not mean every scenario passed a fresh test or human check in this documentation pass. Record the commands, revision, environment, and observed result when performing verification. Keep personal learning context in the private learner profile.

## Implemented foundations

| Area                | Present in code                                                                                                                           | Relevant evidence location                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Local runtime       | CLI-owned Next app, local engine, private sessions, one owner per root/data namespace, alternate port when unowned saved port is occupied | packages/cli/src/features/workspace and its tests                 |
| Command clients     | Authenticated discovery, structured reads/mutations, explicit IDs, lifecycle commands, help catalog                                       | packages/cli/src/features/commands; workspace-client tests        |
| Git sources         | Browser/CLI working-tree, commit, endpoint-range, and branch inspection; bounds/exclusions/binary metadata                                | packages/review-core/src/features/git; local-workspace tests      |
| Persistence/history | Local reviews, notes, selection/completion, folder search/grouping, legacy metadata, reopen/rename/delete                                 | LocalStore history tests; workspace history UI tests              |
| Reading UI          | Diffs, search/navigation, file completion, notes/line comments, responsive panels                                                         | apps/local/src/features/review/tests                              |
| AI preparation      | Grouping, summaries, related-file order, captured context, preparation/retry/fallback UI                                                  | agents UI tests; services/ai and services/inngest tests           |
| AI interaction      | Source-aware chat, selection explanations, correctness findings/evidence, saved runs/conversations, fix prompts                           | agents and AI service tests                                       |
| Re-sync             | Keep/new modes, round identity, unchanged completion, notes/original references, stale-result rejection                                   | local-workspace, history, resync-workspace, and agent-store tests |
| Providers           | Metadata checks, persistent feedback, model discovery/pickers, compatible configuration, subscription flows                               | providers and subscriptions tests                                 |
| Settings/appearance | Saved editor/application/buddy preferences, live diff preview, header actions, autosave, native input-aware hotkeys                       | settings/provider/buddy tests; root shared-hook tests             |
| Agent operations    | CLI review/run/note/settings/provider parity and bundled skill installer                                                                  | packages/cli/tests/agent-workflow.test.ts and installer tests     |
| Hosted foundation   | Separate auth/OTP/device routes and presence code; placeholder dashboard                                                                  | apps/web and apps/connection-server tests                         |

## Known gaps, recorded without implying implementation

- Desktop completion notifications are opt-in; the owner app and a browser tab must remain running.
- Concurrent clients share the convenience `current`; explicit IDs and expected hash/round are the reliable automation target.
- Machine/provider capacity is coordinated within the shared application-data namespace; outside clients and separate data directories remain independent.
- Automatic external-agent launch adapters remain future work; authorized selected fixes, local checks, Git operations, and consolidated reports are implemented.
- Strong compiler-backed analysis centers on JavaScript/TypeScript; Python/Go parsing and optional semantic tools retain explicit limitations.
- CLI publishing, supported-platform readiness, real subscription/provider compatibility, and model accuracy require evidence beyond source fixtures.

See [roadmap features 1–20](local-review-roadmap.md#feature-overview) for detailed targets and acceptance criteria.

## Feature 1 implementation — October 24, 2026

The owner approved background creation with automatic opening for the first review, explicit --open thereafter, and independent browser tabs. Implemented caller-folder capture, revision checks, persisted history status, queue cancellation/retry/priority, shared model admission, restart guards, and transactional owner/session cleanup. Completion notifications were deferred at that checkpoint and are now implemented in Group 3. Implementation commits separate durable jobs/shared capacity, concurrent review workflows, and compact history UI; the roadmap records their IDs. The new packaged background-workspace fixture passed against the real local engine without paid inference. Final regression counts and limitations are recorded in the roadmap progress record.

## Historical verification evidence

The following results were observed during the preceding work at baseline 0860767. They are not new executions in this documentation pass and should not be presented as current certification after code changes.

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

Group 3 implements features 12, 13, 17, 18, and 19 plus the approved notification/update behavior. The roadmap records behavioral decisions and evidence; all changes remain local on `feat/finish-daily-workflow`. Publishing and upgrades to a future published release are deferred. Customizable keyboard shortcuts are excluded from the first version, and `/ai-test` is removed.

Manual tests use a disposable repository and isolated data with allowed cheap providers only. The live Google Flash-Lite flow found an intentional null-cart bug, accepted/promoted it, returned an isolated fix, inspected/applied it in the browser, re-synced the round, passed the regression check, and obtained an apparently-fixed assessment. This validates that flow on macOS, not every provider or platform.

Verified for this implementation: 1,292 passing tests with 13 opt-in skips; successful typecheck, lint, and production build; separately passing clean-archive and independent-CLI suites; Chrome notification permission/category, draft, focus/commands, update cancellation/diagnostics, report/evidence/export, and Git flows. A local bare remote verified checkpoint blocking, an explicit override, and existing-hook restoration. The roadmap has the detailed evidence and limits. Test-owned runtime processes were stopped; publishing, future published-version installation, and non-macOS execution remain unchecked.
