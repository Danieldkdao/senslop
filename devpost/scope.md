---
doc: scope
status: approved
last-reconciled: 2026-10-26
implementation-baseline: 738af5b
---

# Senslop — Current Scope

## Product direction and delivery status

Senslop is a local code review platform for developers who want to understand changes and catch bugs before pushing them. The long-term vision is **the ultimate local code review platform**.

The implemented loop is **make changes → review locally → investigate findings → fix → verify → commit and push when ready**. A CLI owns the protected local browser workspace and background job engine; local review needs no Senslop cloud account or hosted database. Model inference uses the user's configured local or remote provider.

As of October 26, 2026, feature 1 and the approved scopes of all three delivery groups are implemented. Groups 1–2 are merged; the daily-workflow delivery and subsequent UI/runtime fixes are committed on `feat/finish-daily-workflow`. The package remains private, publishing is deferred, and additional platform/provider and release checks remain open; implementation completion is separate from release certification.

## Distinctive value

Organize a large change into behavior-based flows, introduce definitions and dependencies before their consumers, and place related tests after the implementation. Combine that reading path with frozen source navigation, contextual explanations, evidence-backed findings, durable notes, executable checks, and optional buddy feedback.

Exact changed regions each have one completion owner; one file can participate in several flows. Legacy whole-file grouping seeds those regions, and users can edit the organization without losing unambiguous unchanged progress.

## Audience and motivation

The primary audience is developers working with coding agents and reviewing large volumes of generated code. The owner wants to improve their understanding and reduce repeated push/review/fix cycles by finding issues locally.

A coding agent can prepare a saved review through the CLI and hand it to a human. A human can create a persistent fix task for selected findings or notes, then give its exported instructions to an external agent; automatic agent launching remains future work.

## Current core journey

1. Start the local app in the intended Git repository and keep its owning terminal running.
2. Capture working-tree changes, one commit, an endpoint range, or a local branch comparison; ordinary review works without AI and accepts small changes.
3. Optionally group/summarize the frozen review, then read its regions, file overview, impact links, supporting source, and notes.
4. Request chat, selected-code explanations, requirement assessment, or an explicit correctness review using configured models and source policies.
5. Make finding decisions, compare rounds, and hand selected findings to an agent in a managed worktree or an explicitly chosen current checkout.
6. Inspect returned edits, apply selected files where appropriate, re-sync, and run explicitly selected commands against the exact captured revision.
7. Inspect verification evidence, export an immutable round report, and optionally promote deliberate decisions into scoped project guidance.
8. Stage files/hunks, commit with configured hooks/signing, inspect outgoing coverage, and push through the optional checkpoint when ready.

CLI creation prepares later reviews in the background; the first review opens automatically and `--open` opens a dedicated review tab. Existing readers retain their own review/file/position. Saved jobs support cancellation, retry, priority, and restart recovery; preparation can be stopped before its job first appears in polling.

## Implemented product boundary

- Frozen source, hashes, before/after coordinates, archived rounds, and eligible keep/new re-sync.
- Exact changed-region flows, manual organization, completion, impact guidance, frozen file/symbol/content search, and supported image/JSON views.
- File/line notes, request briefs, acceptance criteria, scoped rules/profiles, chat/explanations, and correctness-run history.
- Stable finding decisions and observations, manual or model verification, task claim/return/application, and exact-source command/check evidence.
- Project/worktree discovery, source/model controls, local-only routing, usage accounting, and per-review budgets.
- Live Git staging/unstaging, guarded commits, fetch, clean-tree fast-forward pull, normal push, conflict inspection, and optional terminal/app push checkpoints.
- Explicit project memory and immutable per-round HTML/JSON reports with current source-policy filtering.
- Opt-in desktop activity notifications, first-run guidance, command palette, focused reading, searchable settings, saved view state/drafts, and optional buddy customization.
- Version/update availability, confirmed supported-install updates, diagnostic export in About, and source/metadata data-management actions.
- Provider/subscription connections, model selection, shared capacity controls, OS credential storage, structured CLI commands, and an installable agent skill.
- A declared deterministic quality corpus and opt-in live findings/grouping evaluation harness, with saved comparisons and explicit unknown usage/cost.

## Important current limits

- The app owner must stay running for background execution; desktop activity delivery also needs a workspace tab, browser permission, and category opt-in.
- `current` is shared convenience state; concurrent automation should retain explicit review/job IDs and hash/round expectations.
- App ownership and model capacity are coordinated within the application-data namespace; separate data directories and external clients remain independent.
- A valid source excerpt, a model assessment, a passing command, and a human decision are distinct evidence; none automatically resolves a finding.
- Source storage is local, but configured remote inference may transmit permitted context and incur provider charges.
- External-agent handoffs require explicit agent participation through the task protocol; Senslop does not automatically launch agents or stop their independently launched processes.
- Checks run with host permissions in managed worktrees, not an OS sandbox; dependency installation is explicit, and unsupported changed inputs or mode changes require manual handling.
- Review capture bounds remain enforced, while unchanged tracked execution assets stream independently of the 20 MiB review snapshot limit.
- JavaScript/TypeScript has the strongest semantic support; real optional language servers, additional operating systems, broader live-provider compatibility, and quality promotion thresholds need further evidence.
- Package publication and actual upgrades to a future published release remain deferred; the supported try-out path is a source checkout.
- Hosted authentication/device/presence services remain separate, and the hosted dashboard is a placeholder.

## Next work and document ownership

The [roadmap](local-review-roadmap.md) preserves approved scopes, delivery history, remaining release checks, and deferred decisions, including automatic agent adapters, a permanent daemon, and customizable shortcuts. Hosted PR ingestion and team approval workflows remain outside the product direction.

Use this scope for the boundary, [PRD](prd.md) for behavior, [spec](spec.md) for architecture/contracts, [checklist](checklist.md) for dated verification, and [README](../README.md) for trying/building/running the app. Dated research and the private learner profile preserve historical context rather than define current implementation status.
