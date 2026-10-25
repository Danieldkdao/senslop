---
doc: scope
status: approved
last-reconciled: 2026-10-24
implementation-baseline: 0860767
---

# Senslop — Current Scope

## Product direction

Senslop is a local code review platform for developers who want to understand changes and catch bugs before pushing them. The long-term vision is **the ultimate local code review platform**.

The current product is an installable CLI that owns a local browser workspace and background job engine. Local review does not require a Senslop cloud account. Model inference uses the user's configured local or remote provider.

The intended loop is **make changes → review locally → investigate findings → fix → verify → commit and push when ready**. Today the application supports capturing, organizing, reading, discussing, and analyzing changes. Fix application, executable verification, and in-app Git mutation remain future work.

## Distinctive value

Organize a large change into behavior-based groups, order definitions and dependencies before their consumers, and place related tests after the implementation. Combine that reading path with contextual explanations, evidence-backed AI findings, durable notes, and optional buddy feedback.

The current grouping unit is a whole changed file, assigned once to a group. Hunk-level grouping is proposed in the [roadmap](local-review-roadmap.md).

## Audience and motivation

The primary audience is developers working with coding agents and reviewing large volumes of generated code. The owner wants to improve their own understanding of that code and reduce repeated push/review/fix cycles by finding issues locally.

A coding agent can prepare a saved review through the CLI and hand it to a human. The human retains control over review decisions and changes to source.

## Current core journey

1. Start the local app in the intended repository with `senslop app start`.
2. From the browser or another terminal, select working-tree changes, one commit, an endpoint range, or a local branch comparison.
3. Save a frozen review. Optionally group and summarize it using configured AI task models.
4. Read the diff in the browser, follow the suggested file order, search, inspect explanations, and add file or line notes.
5. Mark files complete and optionally advance to the next file. Use snapshot chat or explicitly run AI correctness analysis.
6. Inspect findings and their original source evidence; copy targeted or combined fix instructions for a coding agent.
7. Reopen reviews later, or re-sync an eligible working-tree review using keep or new mode.

CLI creation prepares in the background when another saved review exists; the first review opens automatically. Explicit CLI Open uses a dedicated browser tab, while browser Open changes only its own tab. Tabs keep independent review/file selection. Feature 1 includes caller-folder tracking, persisted history status, queue controls, recovery, and shared capacity. Completion notifications are deferred by the owner.

## Implemented product boundary

- Repository-bound Git inspection from browser and CLI, including small changes.
- Immutable before/after source per captured round, validated paths, hashes, and original diff coordinates.
- Durable local reviews, notes, completion, selected file, conversations, grouping, and correctness-run history.
- History grouped by each review's recorded caller folder, with name/path search and legacy-folder fallback.
- Optional AI grouping, source-aware chat, selected-code explanations, correctness findings, and copyable fix prompts.
- Read-only frozen context tools, strongest semantically for JavaScript/TypeScript.
- Persistent local background jobs, captured task settings, retries, cancellation, restart recovery, and stale-result protection.
- Multiple short CLI clients attached to one owned app per resolved repository/data namespace.
- Provider and subscription connections, model selection, capacity settings, and OS credential storage.
- Searchable settings, saved editor/application preferences, keyboard navigation, and a configurable floating buddy.
- A bundled agent skill and structured commands for the implemented review, note, run, provider, and settings operations.

## Important current limits

- The owning app terminal must remain running for background execution. A closed command client is different from stopping the app.
- `current` remains shared; concurrent automation should retain explicit IDs and hash/round expectations.
- Capacity and app ownership are scoped to the application-data namespace; separate data directories remain independent.
- Static evidence and a valid source excerpt do not prove a finding's correctness.
- AI requests may transmit captured context to the selected remote provider. Local storage does not imply local inference.
- Fixes are instructions for the user's agent. Senslop does not currently edit source, run arbitrary project checks, stage, commit, pull, or push.
- Findings do not yet have individual accept/dismiss/resolve states or automatic fix verification.
- Historical hosted authentication and presence services remain separate. The hosted dashboard is a placeholder, not the local review workspace.

## Next-stage direction

The [20-feature roadmap](local-review-roadmap.md) records proposed behavior, acceptance criteria, dependencies, and implementation entry points. Its first milestone combines background preparation, finding decisions, round comparison, agent fix handoff, and local verification.

In-app Git conveniences, including push and pull, are accepted future direction. Hosted PR ingestion and team approval workflows are outside this roadmap. Full roadmap delivery is not required for a hackathon submission.

## Document ownership

Use this scope for the current product boundary, [prd.md](prd.md) for user-visible behavior, [spec.md](spec.md) for architecture and contracts, and [checklist.md](checklist.md) for verification status. The older hosted-upload design is available in Git history and dated research notes; it is not an alternate current implementation.
