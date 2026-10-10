---
doc: scope
status: approved
---

# Senslop

A website and installable CLI that make reviewing AI-generated code easier to understand and more enjoyable.

## Architecture revision — October 8, 2026

The owner moved the existing review workspace into a Next.js application bundled with the CLI. Local inspection is account-free and runs in one terminal; hosted authentication stays in `apps/web`, whose dashboard now contains only “dashboard”. Source delivery is local, with no cloud preview relay. Current notes retain their in-memory behavior; persisted reviews, AI, managed inference, and subscriptions are not added by this pass. See `spec.md > Local architecture revision` for the implementation boundary. References below to account-connected uploads and cloud review storage describe the earlier direction and are superseded by this revision.

## The Unique Kernel

Turn a large code change into connected, meaningful review chunks ordered so definitions and dependencies come before the code that uses them. Pair that guided path with contextual explanations and an encouraging buddy, helping developers understand what they review.

## Who It's For

Developers who use AI coding agents and face large volumes of generated code. They need to understand the changes before moving forward, but reviewing long diffs is tedious and ordinary grouping does not provide a clear learning order.

## The Core Loop

The developer connects the CLI to their website account and manually uploads a selected change from a local Git repository: one commit, uncommitted changes, or a range of commits. Background AI analyzes the relevant code and prepares connected chunks and a review order. The developer reviews those chunks in the website, opens contextual explanations, and records notes tied to sections. The buddy encourages them and celebrates progress. On completion, the website turns the notes into a detailed prompt they can copy for their coding agent. They return for their next set of changes.

## Inspiration & Identity

[Trigger.dev](https://trigger.dev/) inspires the relationship between local CLI setup and a cloud website showing progress and results. The review experience should feel cheerful and supportive, with a buddy, short movements, milestone celebrations, and potentially confetti. Specific visual design remains for the PRD.

## Why This Matters to the Learner

“I just want to get better at the workflow of coding with AI and just making sure I understand all the code it generates.” The product addresses their frustration with tedious reviews and a lack of useful review order.

## What "Working" Looks Like

Someone can install the CLI, connect to their website account, and manually submit each supported kind of local Git change. The website shows processing progress and then a usable AI-organized review. The developer follows the order, sees related sections and any collapsed context, asks for a simple explanation of selected code, and leaves section-linked notes. The buddy responds to review milestones. Finishing produces a copyable prompt containing the review notes.

The demonstration should show definitions followed by their uses across a real change, with an inline explanation helping the reviewer understand a section and a note carried into the final prompt. No one-minute video limit is assumed.

## The POC Boundary

- A working website with account sign-in and a way to connect an installable CLI.
- Manual uploads from a local Git repository for a single commit, uncommitted changes, and a range of commits.
- Background AI analysis to group relevant changes, break large files into meaningful chunks, and order the review by dependencies. Supporting context must be sufficient for useful explanations; the exact collection strategy belongs in the spec.
- A connected review interface with access to collapsed sections, contextual explanations for selected code, section-linked notes, and review progress.
- A supportive buddy with simple milestone celebrations.
- A detailed, copyable follow-up prompt assembled from the user's notes.

This is a functional first version with a deliberately broad scope. It may take longer than the curriculum's suggested 2–4 hours of active work; that is an estimate, not a delivery guarantee.

## Later

- Automatic uploads or triggers when the developer pushes code.
- Direct GitHub integration or importing pull requests. Local Git inputs are sufficient for this version; a dedicated local branch-comparison command has not been included among the three agreed inputs.
- Sending the final prompt directly to a coding agent rather than copying it.
- Automated AI code reviews or an agent that independently reviews for issues. In this version AI prepares the human review and explains code.

## Explicitly Cut

No ideas are permanently discarded at this stage. The integrations and automation above are deferred to keep the first version centered on manual local uploads and human understanding.
