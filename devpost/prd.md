---
doc: prd
status: approved
---

# Senslop — Product Requirements

## Persistent connection feedback and editor preview — October 9, 2026

The owner authorized these two refinements to the existing settings flow. Earlier sections remain historical context.

- Automatic connection-check feedback remains visible after saving and refreshing the configured provider. A failed check keeps its destructive message and retry action until another check replaces it or settings close; it does not disappear on a settings refresh. Secure storage remains independent of provider validity.
- Below the Editor review controls, show a live sample diff using the workspace renderer and theme. The sample includes word and single-character edits, additions, deletions, unchanged context, and long lines. Split/unified view, every indicator and inline-highlight style, backgrounds, wrapping, and line numbers update immediately. Sample code creates no reviews, notes, or repository changes.

## Automatic connection feedback and workspace refinements — October 9, 2026

The owner authorized these follow-up changes. Earlier decisions below remain historical context; this section supersedes their manual connection-testing and navigation details.

- Remote API keys save on Enter or leaving the key form, then automatically check the saved connection. Local API-key blur and configuration submission likewise save and check. Reveal/hide focus stays within the key field and never submits. Secure-storage failures retain the draft and skip the network request. Successful storage clears the draft even if the metadata check fails, keeps the configured connection, and shows recoverable feedback. Retry uses the stored credential without re-entering it. Checks send no source or inference request; public or unsupported metadata endpoints explicitly cannot verify a key.
- Shared tooltips replace native `title` hints through the Base UI composition API. Shared Providers owns the tooltip provider; disabled controls retain their hint through a neutral focusable wrapper. Toasts render above modal overlays. Authored `space-y-1` layouts use column flex with `gap-1`.
- Workspace controls scroll within a constrained width so filenames keep space on narrow screens. Completed files have a header checkmark, an outlined/tinted sidebar row, and a highlighted workspace header/border using the owner's existing semantic primary color. The `d` shortcut toggles existing durable completion and ignores text editing, overlays, modifiers, IME input, and held-key repetition.
- Settings entries with children expand/collapse through one full-row trigger; leaf entries navigate directly. Search reveals nested matches, and local configuration remains inside the same breadcrumb dialog so automatic feedback is visible. Provider descriptions and metadata errors no longer suggest entering a model ID.

A website and installable CLI for developers who want to understand AI-generated code through an enjoyable, guided review.
Source: `scope.md > Who It's For` and `scope.md > The Unique Kernel`.

## Provider inputs and history follow-up — October 9, 2026

This owner-authorized follow-up supersedes the model-selection interface described below. Model choice belongs to a future review flow.

- Use the shared PasswordInput for both inline and local-provider API keys. Reveal/hide controls do not trigger autosave; leaving the inline key form or pressing Enter saves securely.
- Remove model entry, selection, and discovery controls from provider settings. Preserve existing stored model values for compatibility; new connections save an empty model. Connection tests remain metadata-only and send no repository source.
- Use TanStack Query for saved-review fetching with the existing Pacer debounce. Keep query configuration in the feature hook, cancel superseded requests, refetch after mutations and reopening, and support offline access to the local server.
- Extract the new-review popover with its validation and form state into its own workspace component. Keep repository refresh and workspace actions in the toolbar.

## Local workspace and settings refinement — October 9, 2026

This later owner instruction supersedes the earlier provider-form and toolbar design while preserving the historical requirements below. Local review still uses no cloud authentication or hosted storage.

- Keep one center file header. Put review history, new review, repository refresh, navigation, completion, search, and settings in its icon-button row. Repository/branch selection and frozen-snapshot details belong in the new-review popover; use styled shadcn Select controls.
- Saved reviews use a Command dialog. Search review names in repository-scoped SQLite with a 250 ms TanStack React Pacer debounce and cancel superseded requests. Each result retains snapshot/progress details, inline rename, icon actions, and explicit deletion confirmation.
- Settings use one searchable dialog with side navigation, ordered Appearance, Editor, then Providers. Reusable section definitions and a screen stack support nested configuration with breadcrumbs inside the same dialog. Remove the separate provider screen and sidebar appearance menu.
- Remote providers require only inline API-key entry, saved on blur or Enter with safe retry feedback. Local providers open their endpoint/context/key/optional-model form inside settings. No connection-name input; existing stored names remain compatible. Model selection is optional and may happen later. The provider list and OS credential-store policy stay unchanged.
- Enter submits notes/comments; Shift+Enter adds a newline. IME composition remains intact, and failed saves retain the draft.
- Retain Node's built-in SQLite driver for this pass: the stable Drizzle 0.45.x used in this repository lacks its official node-sqlite driver, currently documented for the v1 release candidate. Avoid a prerelease ORM or another native database dependency in the clean-install CLI.

## Browser inspection, local history, and provider settings — October 9, 2026

The owner explicitly authorized these three features. This revision supersedes the October 8 deferrals of browser selection, durable local reviews, and provider configuration. Earlier sections remain historical context. The hosted dashboard and account authentication remain separate; local review is account-free.

- Select uncommitted changes, local HEAD or another single commit, an ancestor-to-descendant endpoint range, or a branch compared to HEAD or an optional base entirely in the browser. Git reads stay restricted to the repository opened by the CLI. Never fetch, pull, check out, or mutate Git.
- Share the existing bounded Git collector between CLI and browser. Each inspection saves an immutable snapshot with a UUID and content hash. Show the repository, branch, and when its present state differs from the snapshot. Small selections remain inspectable.
- Save review snapshots, notes with original file/line/code references, selected file, and completion progress in per-user local SQLite. History is separated by canonical repository root. Reopen, rename, and explicitly delete saved reviews with associated data. Refresh, process restart, and normal shutdown preserve reviews; session transport files remain disposable.
- Provider connections support only OpenRouter, ChatGPT using the OpenAI API, Google, Anthropic, Grok, llama.cpp, LM Studio, Ollama, Vercel AI Gateway, Mistral, Deepseek, and OpenCode Zen. Support names, editable endpoints where applicable, model IDs, optional context windows for local servers, keys when required, and a default connection. Show endpoint locality based on the URL rather than provider branding.
- SQLite stores only nonsecret provider configuration. API keys live exclusively in macOS Keychain, Windows Credential Manager, or Linux Secret Service through a credential-store abstraction. Failure never falls back to a plaintext file. Browser responses contain configured state only, and keys are never returned after submission.
- User-triggered connection tests and model discovery may call only the chosen endpoint with no repository source. Use documented model-list APIs, timeouts, bounded responses, no credential-bearing URL parameters, and no redirects. Unsupported discovery allows manual model entry and does not claim verified credentials.
- ProviderIcon uses the installed @lobehub/icons registry, supports registry names and each available variant's typed props, and handles unavailable variants explicitly. Settings follow the owner's supplied Zed references and the existing theme.
- This pass adds configuration only. AI generation, grouping, findings, execution, hosted inference, subscriptions, and billing remain deferred. No local review or credential data goes to hosted Postgres or Senslop cloud services.

## Architecture revision — October 8, 2026

The owner moved the existing review workspace into a Next.js application bundled with the CLI. Local inspection is account-free and runs in one terminal; hosted authentication stays in `apps/web`, whose dashboard now contains only “dashboard”. Source delivery is local, with no cloud preview relay. Current notes retain their in-memory behavior; persisted reviews, AI, managed inference, and subscriptions are not added by this pass. See `spec.md > Local architecture revision` for the implementation boundary. References below to account-connected uploads and cloud review storage describe the earlier direction and are superseded by this revision.

## The Core Journey

Source: `scope.md > The Core Loop`.

1. Visit the landing page, create an account, and sign in.
2. While the CLI is unconnected, follow a setup checklist covering installation and account connection. The website detects connection and replaces onboarding with the main interface.
3. Manually submit one commit, uncommitted changes, or a range of commits from a local Git repository through the CLI.
4. See a fun loading state while background AI analyzes relevant code, creates meaningful chunks, groups related changes, and recommends an order with definitions before their uses.
5. Review the prepared changes, following the recommended order or jumping to any file. Switch the diff display to suit personal preference and reveal collapsed context.
6. Select code for a contextual explanation, leave notes, and mark files complete. The buddy celebrates completed groups.
7. Finish reviewing the files and obtain a detailed, copyable prompt assembled from the notes for the coding agent.
8. Return to the saved review later, or manually sync new local changes using continue sync or full sync.

## Screens and Layout

### Arrival and Setup

Source: `scope.md > The POC Boundary`.

For the current foundation build, the landing page shows only “Senslop”; open `/signup` or `/login` directly. A fuller landing page is deferred until the core flows are tied together. Email/password signup requires a six-digit email verification code; unverified sign-in opens the same verification form. Submission/service feedback uses toasts, while field and code errors stay inline. Verified sign-in and verification preserve the pending CLI device destination. Device authorization requires manually entering the terminal code into a blank field before explicit approval or denial; codes are not prefilled from links. The landing page remains public; dashboard and device approval pages require a verified session, and signed-in users visiting login/signup continue to their saved destination or dashboard. After sign-in, the user enters the review workspace shell immediately. The file sidebar and buddy/notes sidebar show honest empty placeholders, and the center shows connection setup or a connected-with-no-review state. Connection changes update the center automatically. File review and its transition animation arrive with the later upload/review slice.

### Review Workspace

Source: `scope.md > The Unique Kernel` and `scope.md > The POC Boundary`.

Three panels, with both sidebar widths resizable so the center can expand or shrink:

- **Left:** A search bar above collapsible groups containing their files. Groups and files appear in the recommended review order. Users can jump freely to another file.
- **Center:** Sectioned code and diffs. Its header shows the current file, viewing controls, Previous, Next, and Mark as Complete.
- **Right:** The buddy at the top, with notes, tools, and settings below.

The foundation dashboard uses this three-panel shell without a separate site header. Its center header shows “No file selected”, and the file sidebar shows “No files here yet”. Desktop sidebars are resizable with visible slim grips and matching workspace separators. Below 1024px, sidebars disappear and Files/Notes icon buttons open drawers. The right sidebar holds the buddy, empty notes, and an account menu: profile photo or initials and name in the trigger, name/email inside, Settings, nested Change theme, and destructive Sign out. Settings currently shows read-only account details. Command text is vertically centered beside its copy button. Appearance offers Light, Dark, and System with sun, moon, and monitor icons; selection persists locally and System follows the operating system. More palettes and account-synced preferences remain later work.

The user described the right-panel mascot as the buddy/body/bot; these refer to the same supportive companion. Additional tools or settings beyond the named review and appearance controls are not requirements yet.

## Look and Feel

Source: `scope.md > Inspiration & Identity`.

- Cheerful, supportive review experience with animated feedback.
- Fraunces for headings, Outfit for interface text, and JetBrains Mono as the default code font.
- Multiple selectable themes and a few popular alternative code fonts, allowing users to personalize the experience. Exact theme palettes and alternative font choices remain to be named.
- A nicely animated floating explanation bubble over selected code.
- Fun loading and error states, and short buddy movements and congratulations at group-completion milestones. Confetti remains an optional celebration treatment.
- Trigger.dev inspires setup and the local CLI/cloud relationship. The owner’s supplied auth reference now defines sign-in and sign-up: one centered card, buddy above the title and subtitle, GitHub then Google, a divided email form, password visibility and strength feedback, Continue, and account switching. Auth screens have no site header. Keep the existing theme colors and readable font sizes; omit password recovery for this design.

## Features and Behavior

### Account Connection and Local Git Submission

Source: `scope.md > The POC Boundary`.

The installable CLI connects to the user's website account and manually uploads a selected single commit, uncommitted changes, or range of commits. No GitHub connection is required.

Acceptance criteria:

- A newly signed-in, unconnected user sees the setup checklist.
- The main workspace shell is visible immediately; connecting the CLI changes the center from setup to the no-review state. Later uploads populate the review panels.
- Each of the three supported Git inputs can produce a review on the website.
- The uploaded change is associated with the connected user's account.

### Submission Eligibility

Source: `scope.md > The POC Boundary`, refined by the learner during the PRD interview.

A submission is eligible when at least five files each have ten or more changed lines. Smaller changed files do not count toward that minimum, but they are included in the review alongside qualifying files. They must not be silently omitted. If the threshold is not met, explain that the submitted content is ineligible rather than starting a review.

Acceptance criteria:

- Five files with at least ten changed lines each are eligible.
- Four qualifying files plus a smaller file are ineligible.
- Five qualifying files plus a two-line change in a sixth file are eligible, and all six files appear in the review.
- An empty submission is ineligible.
- Ineligible content receives a clear explanation of the minimum requirement.

### AI Preparation and Recommended Review Order

Source: `scope.md > The Unique Kernel`.

Background AI prepares the human review by analyzing relevant code, grouping changes by related functionality, dividing large changed files into meaningful sections, and ordering definitions before their consumers where applicable. Related sections are linked. This is assistance for human understanding, not an autonomous correctness audit.

Acceptance criteria:

- Processing displays the fun loading state.
- A prepared review contains ordered, collapsible groups with ordered files.
- A representative cross-file change puts prerequisite definitions before the code using them, with related sections reachable.
- Changed code is accounted for in the review, and collapsed sections remain inspectable.

### Code Navigation and Diff Views

Source: `scope.md > What "Working" Looks Like`.

Users can search for files, collapse or expand groups, and move in the recommended sequence using Previous and Next or jump directly to any file. Large files are shown in meaningful sections. Viewing controls support a split diff and a full-file view indicating additions and deletions.

Acceptance criteria:

- Searching locates a file without requiring traversal through every group.
- Jumping to a file updates the center header and displayed code.
- Previous and Next traverse the recommended file order.
- Switching diff views preserves the selected file and its review progress.
- Collapsed context can be opened for inspection.

### Inline Explanations

Source: `scope.md > The POC Boundary`.

Highlighting code opens a custom menu with an Explain to me action. The explanation appears in an animated floating bubble over the selected block. It explains the code simply, using the selected code and relevant review context.

Acceptance criteria:

- Selecting a code block exposes the custom explanation action.
- Invoking it displays an explanation anchored to that selection.
- The explanation refers to the selected code and uses available surrounding context.
- A failed explanation offers a retry through the error treatment.

### Notes and Follow-up Prompt

Source: `scope.md > The Core Loop`.

Users write notes in the right sidebar. Each note retains the current file, any selected code, and the user's message. The final detailed prompt carries those references and messages forward so the coding agent can act on the feedback. Sending directly to an agent is deferred.

Acceptance criteria:

- A note with a code selection retains that selection, the file, and the message.
- A note without selected code still retains the file and message.
- Notes remain associated with their review after leaving and returning.
- Completing the review produces a copyable prompt that includes all notes with their file and code context.

### Completion and Buddy Feedback

Source: `scope.md > The POC Boundary`.

Mark as Complete completes the current file without forcing automatic navigation; users move onward with Next or revisit earlier files. A completed group triggers the buddy's short celebration and congratulatory message.

Acceptance criteria:

- Completing a file changes its visible completion state.
- Completing the files in a group triggers the group celebration.
- Revisiting a completed file remains possible.
- Completing all files makes the final notes prompt available.

### Saved Reviews and Sync Modes

Source: `scope.md > The Core Loop`, extended by the learner during the PRD interview.

The current review state is saved to the user's account so it can be resumed, including notes and completion progress. The learner explicitly requested persistence in a database; the technical design belongs in the spec.

- **Continue sync:** Incorporates new changes without losing existing notes or unrelated progress. A previously completed section changed by the sync becomes incomplete. Its file cannot remain fully complete while that section needs review. Retained notes must remain inspectable with their original selected code, even when that code has changed.
- **Full sync:** Restarts the review and completion progress, recommended when the workspace has changed so much that little is shared with the previous review. Before proceeding, warn that full sync clears all existing notes and review progress. Proceeding performs a full reset. Review history is undecided and deferred; it is not a recovery mechanism in this version.

Acceptance criteria:

- Leaving and returning restores saved notes and completion progress.
- Continue sync retains existing notes and preserves progress for unchanged sections.
- A modified completed section becomes incomplete after continue sync.
- Full sync displays a warning before it starts.
- Proceeding with full sync clears existing notes and all review progress.
- Backing out of the warning leaves the existing review intact.

## States and Boundaries

- **Unconnected:** Show the setup checklist until connection is detected.
- **Preparing:** Show a fun loading state while preparing the review.
- **Ready:** Show the ordered review workspace.
- **Failed:** Show a fun error state with a Retry option for an upload or AI preparation failure. The technical retry mechanism belongs in the spec.
- **Partially reviewed:** Save notes and progress so review can resume.
- **Completed:** Make the detailed notes prompt available to copy.
- **Continued sync:** Preserve notes; changed completed sections need review again.
- **Full sync:** Warn before resetting the entire review, including notes and progress.
- **Ineligible submission:** Explain that at least five files must each have ten or more changed lines. Do not start AI review preparation.
- **Connected, no submitted review:** show connection success and guidance to submit an eligible local change through the CLI. This minimal empty state was proposed in the draft and approved during review.

## Product Decisions

- Use a connection-aware checklist and automatically switch to the real interface after CLI connection.
- Keep manual local Git submission and all three agreed input types.
- Use three resizable panels with recommended groups and file search on the left, code in the center, and the buddy and notes on the right.
- Permit users to jump around instead of enforcing review order.
- Offer split and full-file diff views.
- Show explanations in an animated floating bubble over the selection.
- Store each note's file, selected code when present, and message.
- Celebrate completion of a group; navigation remains user-controlled after marking a file complete.
- Offer themes and code-font choices, with Fraunces, Outfit, and JetBrains Mono as the primary typography.
- Persist reviews and support continue and full sync. Continue sync retains notes and reopens changed sections.
- Provide fun loading and error states with retry.
- Require at least five files with ten or more changed lines each, while including additional smaller files in eligible reviews.
- Full sync clears notes and progress and warns before proceeding. Review history is undecided and deferred.

## What We're Building

The approved scope's account-connected website and installable CLI, all three local Git inputs, AI preparation, guided chunked reviews, inline explanations, notes, buddy milestones, and copyable final prompt. PRD additions include resumable saved reviews, two manual sync modes, appearance choices, and resizable panels. These additions make the already broad first version larger; no 2–4-hour delivery promise is assumed.

## Deferred From the POC

- Automatic uploads and push detection: manual CLI submission proves the core loop.
- GitHub integration, direct PR importing, and a dedicated local branch-comparison command: the three selected Git inputs define the first version.
- Sending prompts directly to coding agents: the copyable prompt completes the initial loop.
- Autonomous AI code reviews: this version supports the developer's own review through organization and explanations.
- Review history and recovery of fully reset reviews: undecided and possibly later; not part of this version.

## Non-Goals

No requirement for unspecified sidebar tools, independent bug-finding agents, or a recreation of Trigger.dev's complete product. No verified one-minute video limit is imposed.

## Open Questions

No unresolved product decisions block the spec. The proposed connected empty state was approved during PRD review: show connection success and CLI submission guidance before the first upload.

Can settle during spec/build without repeating the visual-direction interview:

- Exact theme palettes and the small list of alternative code fonts.
- Specific installation, authentication, and Git-selection commands.
- The precise changed-line counting convention, including additions and deletions, must be made explicit in the spec so CLI eligibility feedback is consistent.
- How code context is collected and how changes are matched during continue sync.
- How review-order limitations and non-text files are represented; any newly consequential product limitations must be surfaced before implementation.
