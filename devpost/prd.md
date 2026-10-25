---
doc: prd
status: approved
last-reconciled: 2026-10-25
implementation-baseline: 0860767
---

# Senslop — Current Product Requirements

## Purpose and document status

Senslop helps developers understand changes and find problems locally before pushing. Its vision is the ultimate local code review platform. See [scope.md](scope.md) for the product boundary and [spec.md](spec.md) for implementation details.

This document describes the implementation at the recorded baseline. It replaces the previously interleaved hosted-upload plan and local follow-up notes. The [roadmap](local-review-roadmap.md) separately records proposed features; those are not presented here as delivered behavior.

The recorded commit is the foundation. Feature 1 and the Fix and verify group update the behavior below. Group 1 is committed on `feat/fix-verify`; implementation evidence and verification limits are recorded in the roadmap. The Review with precision group is implemented locally on `feat/review-precision` and remains uncommitted. Completion notifications remain deferred.

## Local setup and ownership

- A CLI-owned local browser app provides the review workspace without a Senslop account or cloud database.
- Run `senslop app start` from the intended repository, and keep its terminal open. `connect` is an alias.
- Short commands from other terminals discover and authenticate to that app. They exit after their operation unless asked to wait.
- Repeated startup for the same resolved repository/application-data namespace reuses the authenticated app and returns its location. Simultaneous startup elects one owner. Separate repositories can run separate apps.
- An unrelated occupied saved port is replaced when the workspace has no live owner.
- Browser closure does not stop the app. Ctrl+C or `senslop app stop` stops both app and worker while retaining durable data.

## Selecting and saving changes

Users can create a review through the browser or CLI from exactly one source:

| Source            | Behavior                                                                      |
| ----------------- | ----------------------------------------------------------------------------- |
| Working tree      | Captures staged, unstaged, and untracked changes against local HEAD           |
| Single commit     | Captures the selected commit's first-parent delta                             |
| Endpoint range    | Compares BASE..HEAD endpoints, subject to the collector's revision validation |
| Branch comparison | Compares a local branch against HEAD or an explicitly selected base           |

Inspection stays within the opened repository and reads Git state. It does not fetch, check out, or mutate source. Deleted/renamed files retain original identity and coordinates; binary changes keep exact hashes and metadata; captured PNG, JPEG, and WebP images within the preview bound also have before/after previews. Excluded files and capture limits receive explicit feedback.

Ordinary saved reviews accept small changes. The legacy standalone JSON inspection's eligibility report is not a minimum-size gate for the local workspace.

Each saved review has an ID, content hash, source metadata, and review round. CLI creation opens the first saved review automatically and prepares later reviews in the background. `--open` explicitly opens a review in a dedicated browser tab. Browser creation and Open select a review only in that tab. Shared `current` remains available for interactive convenience; existing tabs remain pinned to their selected review.

## Review preparation and organization

- Users choose whether new reviews are grouped through saved AI settings or a per-review choice.
- Explicitly requesting grouping requires a configured grouping model; failure to configure it is actionable.
- A shared task model or separate Grouping, Context, Review, and Explain models can be selected.
- Grouping produces behavior-based titles, rationales, file summaries, related-file references, and a suggested reading order.
- Exact changed regions each belong to one flow. One file can appear in several flows. The intended order introduces prerequisites before consumers and keeps tests last. Users can rename/reorder flows, move/split/combine regions, combine flows, and explicitly reset manual organization.
- Users can search grouped files by path or group title and jump freely between files.
- Preparation displays progress and supports stopping, retrying, discarding, and opening AI settings. Retry/fallback feedback distinguishes interrupted or failed work from completed grouping.
- Terminal grouping failure can fall back to the original file review without AI ordering. The snapshot remains saved; failing to group does not make its original diff disappear.
- AI tasks use frozen source and captured settings. Later source changes must not silently alter an existing run's evidence.

## Reading and navigation

The desktop workspace contains a resizable files/notes area, a central code canvas with one file header, and an Agents panel. Narrow layouts expose the relevant drawers instead of requiring full desktop sidebars.

The reader supports:

- Split and unified diffs, syntax highlighting, inline word/character changes, context, line numbers, wrapping, and selectable appearance.
- Monospace file paths in file lists, search results, note/evidence references, and the selected-file header.
- Previous/next region navigation, per-region completion, explicit whole-file completion, frozen file/symbol/content search, and optional automatic advance. Files are complete only when all their regions are reviewed.
- Persistent completion, notes, and configured panel/editor preferences. Each tab retains its own review and selected file, including through reload. Background reviews preserve the existing reader, note draft, focus, and position.
- A file summary where a matching grouping result is available, and access to original evidence for saved AI findings.

Application shortcuts use the shared TanStack Hotkeys hook:

| Key                 | Action                                                 |
| ------------------- | ------------------------------------------------------ |
| K                   | Open file search                                       |
| D                   | Toggle completion of the selected region               |
| Left / Right arrows | Navigate regions when applicable                       |
| R                   | Open saved-review history when enabled                 |
| [ / ]               | Open adjacent saved reviews when enabled               |
| Mod+B               | Toggle the shared sidebar where that component is used |

Input editing, composition, handled events, and open overlays retain their keyboard behavior. Repetition is allowed for file-arrow navigation, while one-shot actions suppress held-key repetition. The history shortcut preference can disable its shortcuts without disabling the UI button.

## Review with precision

Flows/Files, Findings/Requirements, and search modes use shared expanding tabs: the selected tab grows to available width and shows its label/count; inactive tabs show icons with accessible names and tooltips. Arrow/Home/End keys, disabled items, controlled/uncontrolled selection, and reduced-motion preferences are supported. Disclosures use shadcn Collapsible. The Impact trigger retains its height when expanded and has no unrelated file action.

Region ownership covers changed lines exactly once, including binary/metadata fallback units. Legacy file groups seed region flows and file completion carries into units. Later rounds preserve unambiguous unchanged/moved regions and manual boundaries; changed or ambiguous source remains unreviewed. Generated/repetitive regions can collapse without changing totals. Reading-order and attention-order views remain separate; attention is explained by concrete impact reasons rather than a score.

A versioned review brief stores the original request, selected captured Markdown/text documents, optional issue links, and editable/reordered acceptance criteria. Model-suggested criteria remain editable. Requirement assessments distinguish Implemented, Verified, Missing, and Unclear, with frozen evidence, explicit questions, and unexpected scope changes. Verified requires source evidence plus explicitly linked passing checks for the exact changed revision; a model label alone is insufficient. Editing a brief or changing rounds marks older conclusions outdated.

Explicit `.senslop/review.json` configuration can select profiles, scoped rules, and instruction documents. Nested configuration applies within its subtree, followed by local project and single-review overrides. Correctness, security, performance, accessibility, API compatibility, migrations, combined selections, and custom profiles are supported. Unknown fields, unavailable sources, and overridden conflicting rule IDs remain inspectable. Saved runs capture effective instructions and cite applicable rules/profiles; repository text never becomes controlling instructions implicitly.

Impact links captured definitions, references, callers, dependencies, test candidates, exported interfaces, configuration, permissions, and persistence changes, with resolved/parsed/inferred/unresolved provenance. Search and navigation open exact before/after frozen source, maintain a per-tab back/forward trail, and return to the region's reading position. Regions can expand unchanged context or open the full file. Whitespace filtering is visible and does not change ownership/completion. Renamed paths, moved regions, JSON structure, and bounded image previews have explicit fallbacks.

JavaScript/TypeScript retains compiler support. Python and Go include real Tree-sitter parsing and import/test conventions. Optional configured Pyright/gopls-compatible stdio language servers provide semantic symbols/references/diagnostics against temporary frozen copies; missing tools or dependencies leave explicit per-language limitations. Unsupported files remain reviewable as text. Installed real-language-server behavior and additional operating systems remain verification limits.

Settings → Review quality runs the declared synthetic corpus, stores the latest 20 reports per project, compares regressions, and exports inspectable JSON. Reports include missed issues, false positives, duplicates, evidence accuracy, grouping coverage and declared structural usefulness, latency, and available usage/cost. Deterministic contracts cover region ownership, rounds, requirements, rules, parsing, misleading source text, and independent assessments. Live findings/grouping evaluation explicitly opts into the selected Review model plus saved grouping instructions; ordinary tests make no paid requests. Unknown usage/pricing remains unknown, and semantic grouping judgments still need inspection.

## Notes, explanations, and chat

- Add notes for a whole file or selected source lines; search, edit, delete, and revisit saved notes.
- Notes use contiguous full-width rows with internal padding, a wrapping note header, and monospace file/line metadata. Split-diff selection highlights only the chosen column during dragging and after release. Line notes retain original side, coordinates, and source excerpt. Enter submits and Shift+Enter inserts a newline; IME composition and failed-save drafts are preserved.
- Selected-code explanations stream from the configured Explain model. Selection must stay on a supported side of the diff. Users can stop/retry the response or add a note.
- Snapshot chat has a model picker, streaming replies, stop/retry behavior, and saved conversation history.
- Agents can inspect captured source, search, symbols, references, dependencies, and related tests as available. Static tooling does not execute the repository's test suite.
- A consolidated final prompt/report assembled from all human notes is not currently implemented. AI finding fix prompts and structured review exports exist separately.

## AI correctness reviews

A correctness review is an explicit action, separate from organizing files or asking a chat question.

- Users select a Review model and request analysis through the Review panel or CLI.
- Working-tree correctness requests require a matching current repository fingerprint. Stale or unknown state requires refresh/re-sync or an appropriate new review.
- Results show severity, a concise issue description, exact frozen-source evidence, a navigable file/range, targeted fix guidance, and analysis limitations.
- Users can copy individual or combined fix instructions, or select findings and human notes for a persistent fix task. Applying task edits and executing a check are separate explicit actions.
- A successful run with no supported findings is different from a failed, canceled, or incomplete run.
- Saved correctness runs can be reopened, renamed, deleted when finished, and exported. Old results remain associated with their captured review round.
- Evidence validation confirms that referenced code exists in the selected change. It is not a guarantee that the model's diagnosis is true.
- Findings retain durable IDs, optional decision reasons, observation history, duplicate links, and filters. A later run that omits a finding leaves it visible. Original source evidence remains available by round.

## Fix tasks, rounds, and verification

The Review panel filters findings through a tooltip filter icon and popover. Decision changes save immediately; dismissal reasons are optional. Manual verification also accepts an optional note. Every decision and verification outcome has a label and Lucide icon. Finding colors use subdued backgrounds/borders and readable text.

Select findings to create a task or request a new model assessment. Work contains task, check, and verification history. A task records selected evidence, human notes, constraints, suggested checks, the source revision, the handling agent, and activity. Users choose a managed worktree or their current worktree. Manual copy/export and CLI claim/return commands support independent agents; Senslop does not automatically launch them. Canceling a task preserves its evidence and does not stop an external agent process.

Managed worktrees contain the full captured staged, unstaged, deleted, and untracked state plus allowed frozen execution inputs, including dirty helpers retained outside a newer round’s diff. Executable-bit and other file-mode edits require manual handling and are reported explicitly when returning a task. Returned changes have a focused before/after inspector; files outside the request are flagged. Only selected files are applied after inspection, with concurrent-edit and revision guards and the original index preserved. Application re-syncs the review; findings require a separate decision. A failed re-sync after successful application reports that distinction.

The round control uses full-width selectors with a Lucide arrow, and opens captured history or a round-to-round diff without changing the reader. Changed sections reopen while unchanged file completion is retained. Original findings remain inspectable when code moves, is removed, or the current review no longer contains their file. Identical findings at different locations in one run stay independently actionable. Conservative matching preserves unambiguous repeated issues and offers ambiguous matches for explicit linking. Recurrences reopen resolved issues with history.

Checks run an explicitly chosen script or shell command in a managed local worktree with host permissions. Dependency installation is explicit, and an exact-round prepared workspace can be reused. Results retain command, directory, revision, input/dependency hashes, environment, duration, exit status, live output, cancellation, timeout, and selected generated-artifact hashes. Output supports follow/search/copy/download. Unavailable tools, failures, interruptions, and timeouts are distinct. Base comparison reports both outcomes without assuming that two failures have the same cause. Source-changing commands cannot produce a pass for their original inputs, including restored deletions and staged additions. Command results and automatic cleanup compare the source inventory independently of the mutable Git index.

Verification assesses selected findings against frozen source. Model outcomes, matching passing checks, and human decisions remain independent. A passing check only attaches to its exact revision and selected findings. Missing/deleted code does not itself establish a fix. Stale work cannot change newer finding assessments, and a newer round does not prevent canceling an older check. Partial assessments and completed analysis checkpoints remain recorded when later work stops.

## Saved reviews and folder organization

- Review data survives browser refresh, CLI restart, and normal app shutdown.
- History is isolated by resolved Git working-tree root and searched locally by review name or recorded folder path.
- Reviews are grouped by full recorded folder, with the current app folder first, other folders alphabetically, and unknown legacy folders last. Reviews remain newest first within each group.
- Path headings use monospace, and the current folder has an accessible indicator.
- Users can reopen, rename, or explicitly delete a saved review and its associated data. Deletion requires confirmation.
- New CLI reviews record the submitting terminal's effective folder, honoring `--repo`, after validating membership in the resolved workspace. Browser captures use the app folder; legacy records remain readable.

## Re-sync and freshness

Re-sync applies to the explicitly identified working-tree review and expected hash/round, independently of global selection, with a captured identity on the same branch and HEAD. A changed branch/HEAD requires a new review.

| Mode | Result                                                                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep | Updates the existing review ID/round, retains notes and AI history, preserves completion for unchanged files, and preserves its original recorded folder |
| New  | Creates a separate review of newer edits while keeping the previous saved review available                                                               |

Notes keep their original source references, and their current anchors are retained/remapped where the captured code can be matched. Old AI results remain distinguishable from current-round results. Superseded work cannot replace current results.

The UI reports when live repository state differs from the saved inspection. This is freshness feedback, not automatic verification that bugs were fixed.

## Background jobs and multiple clients

Implemented feature 1 behavior:

- Creation, preparation, and opening are separate. Background CLI calls return the captured ID/hash/round, relevant job IDs, and a safe review-specific URL without waiting for analysis. `--wait` remains optional.
- Durable jobs provide queued/running/completed/failed/canceled state, cancellation, priority, retries, and restart recovery. Matching active requests reuse one logical job for the review revision and task kind.
- History shows separate snapshot, grouping, and optional correctness status icons beside Rename and Delete, with progress and errors in keyboard-accessible tooltips. Retry, Cancel, and Priority use icon buttons with tooltips and operate without opening the review. Optional correctness failure does not make the saved code unreadable.
- High priority gives queued work a bounded two-minute preference and does not interrupt running steps. `runs list --all` exposes pending workspace jobs.
- Retrying a failed/canceled job creates a linked attempt with the original revision, captured settings, and priority. Completed-run re-analysis remains a distinct job. Old dispatches and superseded rounds cannot publish over replacement work.
- Model calls share endpoint concurrency and rolling request/token quotas across repository processes in the same application-data namespace. A configurable total request ceiling defaults to four. Separate data directories and outside applications have independent limits.
- The owner must remain running for execution. A client exit or wait timeout retains saved work. Restart recovers pending work; unavailable-owner feedback explains how to restart.
- Automation retains explicit review/revision and job IDs. Follow-up review commands accept `--expected-hash` and `--expected-round`; conflicts require reload and reassessment. Shared `current` remains an interactive convenience.
- Captures and re-sync operations are serialized within the workspace and verify source identity. They do not introduce Git mutations or coordinate external editors through a filesystem lock.

The owner explicitly deferred completion notifications and notification preferences on October 24, 2026. This pass adds no background-completion notification system or daemon.

## Providers, models, and settings

Provider connections include remote APIs, local servers, subscription connections, and custom OpenAI-compatible endpoints. The current supported IDs are defined in the shared contracts and exposed through CLI help; the list is not restricted to the original twelve-provider design.

- Save API keys through masked fields; remote keys save on Enter or leaving the form. Local/custom providers offer relevant endpoint/configuration forms.
- API keys and subscription credentials use OS credential storage. A locked/unavailable store produces feedback without a plaintext fallback.
- Connection saves perform metadata-only checks. Failed checks retain the configured connection and show persistent retry feedback. Public/unsupported model metadata does not prove key validity.
- Model discovery, task model selection, chat model selection, and custom compatible model capability configuration are implemented.
- AI task settings include shared/per-role assignments, grouping mode/instructions, and provider capacity limits. Settings save without requiring a separate submit for each ordinary selection.
- Capacity changes are locked while saved jobs are queued/running. Captured settings protect runs from unrelated later preference changes.
- Subscription sign-in/out and provider sign-in status/cancellation are separate from hosted Senslop account authentication.

Settings are one searchable dialog with Appearance, Review Preferences, Editor, AI/Providers, Source & execution, Data & privacy, and Usage sections. Section links and nested screens preserve breadcrumbs. Optional header actions align with their titles; Add provider remains available when opening Providers from AI settings.

Editor settings include a live sample diff. Appearance includes multiple light/dark palettes and system mode, plus buddy selection, visibility, animation, size, and position. UI preferences persist locally.

## Buddy and feedback

The optional floating buddy responds to review activity, preparation, completion, and failures. Users can move it, choose a character, hide it, or disable animations. Feedback respects reduced motion and should not obstruct review controls.

Service feedback uses shared toasts and accessible loading/error states. Failed operations retain durable reviews and recoverable drafts where supported; they do not claim success.

## Local data and inference boundaries

Reviews, notes, source context, preferences, conversations, and AI output are stored locally. Source capture and analysis do not upload review data to Senslop's hosted database.

Configured remote inference can receive captured source/context and incur provider charges. Local endpoints are identified by their URL; provider branding alone does not guarantee local execution. Current source-analysis tools are read-only.

## Projects, source policy, and usage

The project switcher discovers known projects and sibling Git worktrees, shows root/branch/activity, opens a project in the same tab or through a tooltip icon in a new tab, and keeps saved source readable if a folder disappears. Each origin/tab retains the selected review, file, and scroll position. Reviews remain root-scoped; source policy, AI assignments, and review preferences share the common Git project. Credentials, machine capacity, and appearance stay shared.

Source policy includes path/folder/glob inclusion and exclusion, an inspectable frozen context inventory, and visible model routes. Credentials and symlinks stay excluded. Current policy applies before capture, re-sync reuse, model calls, verification evidence, and task export/claim. Local-only routing blocks remote endpoints and remote subscription integrations. Stricter source rules preserve old evidence locally while blocking incompatible inference and continuation of old conversations. Independent external agents and host shell commands must honor their own access policy; a Git worktree is not an OS sandbox.

History, logs, and owned workspaces have retention controls. Default history is indefinite, logs expire after 30 days, and unchanged inactive workspaces after seven days. Cleanup preserves newer source edits and active work. Deletion requires active tasks/checks to stop; it cleans owned workspaces before deleting evidence. Metadata/source exports are separate, and the diagnostic bundle omits source and credentials.

Usage accounting records model requests, context calls, retries, measured tokens, and request duration without storing prompts in accounting records. Per-review token and aggregate request-time allowances use conservative reservations. Concurrent requests share one remaining request-time allowance, which is rechecked while requests run. Quick skips delegated context; Thorough permits it. Compatible unchanged grouping and retry checkpoints can be reused. Stops retain completed work and show actionable budget/policy feedback. Aggregate Usage settings use shadcn charts/tooltips; the compact popover uses a small progress ring. Missing pricing and unreported usage remain unknown, and independent external-agent usage is outside these totals.

## Separate hosted application

The repo retains hosted signup/login, email verification, device authorization, account status/logout, and presence-service code. The landing page displays Senslop and the hosted dashboard displays a placeholder. These are not prerequisites or the entry point for local reviews.

## Current omissions and next work

The [roadmap](local-review-roadmap.md) is authoritative for proposed next-stage behavior. Current omissions include completion notifications, automatic external-agent launch adapters, in-app stage/commit/fetch/pull/push, and consolidated review reports. The precision corpus and saved comparison reports are implemented. Real-provider diagnosis quality and model-promotion thresholds remain unestablished.

Git push/pull conveniences are accepted future direction. Hosted PR ingestion and team approval workflows are outside the current roadmap. Do not convert those future directions into claims about today's application.
