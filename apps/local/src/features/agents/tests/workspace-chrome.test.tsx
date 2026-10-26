// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import {
  savedReviewSchema,
  projectPolicySchema,
  trackedFindingSchema,
} from "@senslop/contracts";
import { toast } from "@/components/ui/toast";
import { defaultUiPreferences } from "../../settings/constants";
import { AgentPanel } from "../components/agent-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NoteControls } from "../../review/components/note-controls";
import userEvent from "@testing-library/user-event";
vi.mock("../../precision/hooks/use-review-intent", () => ({
  useReviewIntent: () => ({
    state: {
      data: {
        briefs: [
          {
            version: 1,
            request: "Keyboard support",
            documents: [],
            links: [],
            criteria: [
              { id: "keys", text: "Keyboard navigation", checkIds: [] },
            ],
          },
        ],
      },
    },
    act: vi.fn(),
    pending: false,
  }),
}));
const workflowFeedback = vi.hoisted(() => ({
  data: undefined as
    import("../../workflow/schemas").WorkflowStateSchema | undefined,
  act: vi.fn(),
}));
vi.mock("../../workflow/hooks/use-review-workflow", () => ({
  useReviewWorkflow: () => ({
    state: { data: workflowFeedback.data },
    act: workflowFeedback.act,
  }),
}));
vi.mock("../../settings/hooks/use-ui-preferences", () => ({
  useUiPreferences: () => ({ values: defaultUiPreferences }),
}));
vi.mock("../../review/hooks/use-diff-highlighter", () => ({
  useDiffHighlighter: () => ({ ready: false, error: false, retry: vi.fn() }),
}));
const models = vi.hoisted(() => ({ review: false, fingerprint: "current" }));
vi.mock("../../workspace/hooks/use-workspace-metadata", () => ({
  useWorkspaceMetadata: () => ({
    data: {
      repository: {
        fingerprint: models.fingerprint,
        branch: "feature",
        head: "head",
      },
    },
  }),
}));
vi.mock("../hooks/use-ai-settings", () => ({
  useAiSettings: () => ({
    settings: {
      data: { separate: true, roles: { review: models.review ? {} : null } },
    },
  }),
}));
vi.mock("../hooks/use-agent-state", () => ({ useAgentHistory: () => ({}) }));
vi.mock("../components/agent-chat", () => ({ AgentChat: () => null }));
beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  workflowFeedback.data = undefined;
  workflowFeedback.act.mockReset();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  cleanup();
  vi.unstubAllGlobals();
});

test("agent tabs occupy the panel header without a separate title row", () => {
  render(
    <AgentPanel
      agents={{ state: { data: { jobs: [] } } } as never}
      onEvidence={vi.fn()}
    />,
  );
  const header = screen.getByLabelText("Agents").querySelector("header")!;
  expect(within(header).getByRole("tab", { name: "Chat" })).toBeTruthy();
  expect(
    within(header)
      .getByRole("tab", { name: "Chat" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(within(header).getByRole("tab", { name: "Review" })).toBeTruthy();
  expect(within(header).queryByText("Agents")).toBeNull();
});
test("header keeps the add-note action and removes the notes browser", () => {
  render(<NoteControls onAddNote={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Add note" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Browse notes" })).toBeNull();
});

test.each([
  [undefined, "plus", false],
  ["queued", "clock", false],
  ["running", "loader-circle", true],
  ["completed", "circle-check", false],
  ["failed", "circle-x", false],
  ["canceled", "circle-minus", false],
] as const)(
  "review controls expose the %s state and collapse independently",
  async (status, icon, loading) => {
    const act = vi.fn();
    const job = {
      id: "review",
      snapshotId: "snapshot",
      kind: "review",
      status,
      createdAt: "2026-10-16T20:00:00Z",
      settings: { separate: false, shared: { name: "Fixture model" } },
      progress: status === "running" ? "Checking startup callers" : null,
      result:
        status === "completed"
          ? {
              summary: "Findings stay available when controls collapse.",
              findings: [
                {
                  title: "Missing guard",
                  severity: "high",
                  problem: "Guard the input before reading it.",
                  path: "a.ts",
                  side: "after",
                  start: 1,
                  end: 1,
                  code: "input.value",
                  fixPrompt: "Add the guard.",
                },
              ],
              limitations: [],
              fixAllPrompt: "",
            }
          : null,
    };
    render(
      <AgentPanel
        snapshotId="snapshot"
        agents={
          { state: { data: { jobs: status ? [job] : [] } }, act } as never
        }
        onEvidence={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));
    const toggle = screen.getByRole("button", { name: /Review controls/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const statusIcon = toggle.querySelector("svg")!;
    expect(statusIcon.classList.contains(`lucide-${icon}`)).toBe(true);
    expect(statusIcon.classList.contains("animate-spin")).toBe(loading);
    if (!status) expect(within(toggle).getByText("New review")).toBeTruthy();
    else {
      const statusText = within(toggle).getByRole("status");
      expect(screen.getAllByText(statusText.textContent!)).toHaveLength(1);
      if (status === "running")
        expect(statusText.textContent).toContain("Checking startup callers");
    }
    expect(screen.getByRole("button", { name: "Run review" })).toBeTruthy();
    const results = screen.getByRole("region", { name: "Review findings" });
    expect(results.classList.contains("flex-1")).toBe(true);
    expect(results.classList.contains("overflow-y-auto")).toBe(true);
    await user.click(toggle);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Run review" })).toBeNull(),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("region", { name: "Review findings" })).toBe(
      results,
    );
    if (status === "completed")
      expect(
        screen.getByText("Findings stay available when controls collapse."),
      ).toBeTruthy();
    await user.click(toggle);
    expect(
      await screen.findByRole("button", { name: "Run review" }),
    ).toBeTruthy();
    expect(act).not.toHaveBeenCalled();
  },
);

test("completed review summaries appear between review metadata and the combined fix prompt", async () => {
  const summary = "Fix the startup crash before merging.";
  const job = {
    id: "review",
    snapshotId: "snapshot",
    kind: "review",
    status: "completed",
    title: "Reviewed changes",
    createdAt: "2026-10-16T20:00:00Z",
    settings: { separate: false, shared: { name: "Review model" } },
    result: {
      summary,
      findings: [
        {
          severity: "high",
          title: "Missing guard",
          problem: "An empty input crashes startup. Guard the input.",
          path: "a.ts",
          side: "after",
          start: 1,
          end: 1,
          code: "input.value",
          fixPrompt: "Guard the input.",
        },
      ],
      limitations: [],
      fixAllPrompt: "Verify the input guard.",
    },
  };
  render(
    <AgentPanel
      snapshotId="snapshot"
      agents={{ state: { data: { jobs: [job] } } } as never}
      onEvidence={vi.fn()}
    />,
  );
  await userEvent.setup().click(screen.getByRole("tab", { name: "Review" }));
  const metadata = screen.getByText("Reviewed changes");
  const description = screen.getByText(summary);
  const prompt = screen.getByRole("button", { name: "Fix with agent prompt" });
  expect(
    metadata.compareDocumentPosition(description) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    description.compareDocumentPosition(prompt) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("code reviews cannot start until a Review model is assigned", async () => {
  const act = vi.fn();
  const { rerender } = render(
    <AgentPanel
      snapshotId="snapshot"
      agents={{ state: { data: { jobs: [] } }, act } as never}
      onEvidence={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Review" }));
  const button = screen.getByRole("button", { name: "Run review" });
  expect(button.hasAttribute("disabled")).toBe(true);
  await user.click(button);
  expect(act).not.toHaveBeenCalled();
  models.review = true;
  rerender(
    <AgentPanel
      snapshotId="snapshot"
      agents={
        { state: { data: { jobs: [] } }, act: vi.fn(async () => {}) } as never
      }
      onEvidence={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Run review" }).hasAttribute("disabled"),
  ).toBe(false);
  models.review = false;
});

test("grouping keeps agent tabs mounted and disables actions until ready", async () => {
  const { rerender } = render(
    <AgentPanel
      preparing
      snapshotId="snapshot"
      agents={{ state: { data: { jobs: [] } } } as never}
      onEvidence={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen.getByRole("tab", { name: "Review" }).getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    screen.getByText(/Chat and AI reviews will be available/),
  ).toBeTruthy();
  rerender(
    <AgentPanel
      snapshotId="snapshot"
      agents={{ state: { data: { jobs: [] } } } as never}
      onEvidence={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-disabled"),
  ).not.toBe("true");
  await waitFor(() =>
    expect(
      screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected"),
    ).toBe("true"),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Review" }));
  expect(
    screen.getByRole("tab", { name: "Review" }).getAttribute("aria-selected"),
  ).toBe("true");
  rerender(
    <AgentPanel
      preparing
      snapshotId="snapshot"
      agents={{ state: { data: { jobs: [] } } } as never}
      onEvidence={vi.fn()}
    />,
  );
  rerender(
    <AgentPanel
      snapshotId="snapshot"
      agents={{ state: { data: { jobs: [] } } } as never}
      onEvidence={vi.fn()}
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("tab", { name: "Review" }).getAttribute("aria-selected"),
    ).toBe("true"),
  );
});

test("a running code review keeps its action label and uses LoadingSwap", async () => {
  render(
    <AgentPanel
      snapshotId="snapshot"
      agents={
        {
          state: {
            data: {
              jobs: [{ id: "review", kind: "review", status: "running" }],
            },
          },
        } as never
      }
      onEvidence={vi.fn()}
    />,
  );
  await userEvent.setup().click(screen.getByRole("tab", { name: "Review" }));
  const button = screen.getByRole("button", { name: "Run review" });
  expect(button.getAttribute("aria-busy")).toBe("true");
  expect(
    button.querySelector('[role="status"][aria-hidden="false"]'),
  ).toBeTruthy();
});

test("stop code review submits its job ID once while cancellation is pending", async () => {
  let finish!: () => void;
  const act = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <AgentPanel
      snapshotId="snapshot"
      agents={
        {
          state: {
            data: {
              jobs: [{ id: "code-review", kind: "review", status: "running" }],
            },
          },
          act,
        } as never
      }
      onEvidence={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Review" }));
  const button = screen.getByRole("button", { name: "Stop review" });
  await user.click(button);
  expect(act).toHaveBeenCalledWith({ action: "cancel", id: "code-review" });
  const pending = screen.getByRole("button", { name: "Stop review" });
  expect(pending.getAttribute("aria-busy")).toBe("true");
  await user.click(pending);
  expect(act).toHaveBeenCalledTimes(1);
  finish();
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Stop review" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
});

test("stale snapshots cannot start reviews and explain how to resume", async () => {
  models.review = true;
  render(
    <AgentPanel
      snapshotId="snapshot"
      snapshotFingerprint="old"
      snapshot={
        {
          status: "ready",
          fingerprint: "old",
          source: { kind: "working-tree", base: "head" },
          repositoryState: { branch: "feature", head: "head" },
        } as never
      }
      agents={{ state: { data: { jobs: [] } }, act: vi.fn() } as never}
      onEvidence={vi.fn()}
    />,
  );
  await userEvent.setup().click(screen.getByRole("tab", { name: "Review" }));
  expect(
    screen.getByRole("button", { name: "Run review" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText(/Re-sync your changes before running/)).toBeTruthy();
  models.review = false;
});

test("saved AI review history supports rename and confirmed deletion without opening the review", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const act = vi.fn<(input: { action: string }) => Promise<object>>(
    async () => ({}),
  );
  const job = {
    id: "review-id",
    snapshotId: "snapshot",
    kind: "review",
    status: "failed",
    createdAt: "2026-10-14T20:00:00Z",
    title: "Saved run",
  };
  render(
    <AgentPanel
      snapshotId="snapshot"
      agents={
        { state: { data: { jobs: [job], conversations: [] } }, act } as never
      }
      onEvidence={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Review" }));
  await user.click(screen.getByRole("button", { name: "Saved reviews" }));
  await user.click(
    screen.getByRole("button", { name: "Rename review Saved run" }),
  );
  const input = screen.getByRole("textbox", { name: "Review name" });
  await user.clear(input);
  await user.type(input, "New review name{Enter}");
  await waitFor(() =>
    expect(act).toHaveBeenCalledWith({
      action: "rename-review",
      id: "review-id",
      title: "New review name",
    }),
  );
  expect(screen.getByRole("dialog", { name: "Saved AI reviews" })).toBeTruthy();
  await user.click(
    screen.getByRole("button", { name: "Delete review Saved run" }),
  );
  expect(
    act.mock.calls.some(
      ([input]) => (input as { action: string }).action === "delete-review",
    ),
  ).toBe(false);
  const dialog = screen.getByRole("dialog", { name: "Delete this AI review?" });
  await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(act).toHaveBeenCalledWith({
      action: "delete-review",
      id: "review-id",
    }),
  );
  expect(screen.getByRole("dialog", { name: "Saved AI reviews" })).toBeTruthy();
});

test("completed review metadata is compact and review history has a tooltip", async () => {
  render(
    <TooltipProvider>
      <AgentPanel
        snapshotId="snapshot"
        agents={
          {
            state: {
              data: {
                jobs: [
                  {
                    id: "review",
                    snapshotId: "snapshot",
                    kind: "review",
                    status: "completed",
                    createdAt: "2026-10-14T20:00:00Z",
                    settings: {
                      separate: false,
                      shared: { name: "Review model" },
                    },
                    result: { findings: [], limitations: [] },
                  },
                ],
              },
            },
          } as never
        }
        onEvidence={vi.fn()}
      />
    </TooltipProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("tab", { name: "Review" }));
  expect(screen.getByText("Complete")).toBeTruthy();
  expect(screen.getByText("Review model")).toBeTruthy();
  expect(screen.queryByText(/Saved run:|Model:/)).toBeNull();
  await user.hover(screen.getByRole("button", { name: "Saved reviews" }));
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="tooltip-content"]')?.textContent,
    ).toBe("Saved reviews"),
  );
});

test.each(["commit", "branch", "working-tree"] as const)(
  "outdated %s snapshots without a viable re-sync recommend a new review",
  async (kind) => {
    render(
      <AgentPanel
        snapshotId="snapshot"
        snapshotFingerprint="old"
        snapshot={
          {
            status: "ready",
            fingerprint: "old",
            source: { kind, base: "previous-head" },
            repositoryState: { branch: "feature", head: "previous-head" },
          } as never
        }
        agents={{ state: { data: { jobs: [] } }, act: vi.fn() } as never}
        onEvidence={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole("tab", { name: "Review" }));
    expect(
      screen.getByText(
        /This snapshot is outdated and cannot be re-synced.*Start a new review/,
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(/Re-sync your changes before running/),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Run review" })
        .hasAttribute("disabled"),
    ).toBe(true);
  },
);

test.each([
  { hash: "old", snapshotRound: 2 },
  { hash: "current", snapshotRound: 1 },
  { hash: "current" },
])(
  "older contents or rounds stay in history without navigating current evidence: %j",
  async (identity) => {
    const onEvidence = vi.fn();
    const job = {
      ...identity,
      id: "old-review",
      snapshotId: "snapshot",
      kind: "review",
      status: "completed",
      title: "Previous findings",
      createdAt: "2026-10-14T20:00:00Z",
      settings: { separate: false, shared: { name: "Model" } },
      result: {
        requirements: {
          criteria: [
            {
              criterionId: "keys",
              status: "implemented",
              explanation: "Previous keyboard handler",
              evidence: [
                {
                  path: "requirement.ts",
                  side: "after",
                  start: 999,
                  end: 999,
                  code: "old",
                },
              ],
              questions: [],
              checkIds: [],
            },
          ],
          unexpectedChanges: [],
          limitations: [],
        },
        findings: [
          {
            severity: "high",
            title: "Old issue",
            problem: "Old contents",
            path: "a.ts",
            side: "after",
            start: 1,
            end: 1,
            code: "old",
            fixPrompt: "Fix",
          },
        ],
        limitations: [],
      },
    };
    render(
      <AgentPanel
        snapshotId="snapshot"
        snapshot={{ id: "snapshot", hash: "current", round: 2 } as never}
        agents={{ state: { data: { jobs: [job] } } } as never}
        onEvidence={onEvidence}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Review" }));
    expect(screen.queryByText("Previous findings")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Saved reviews" }));
    expect(screen.getByText(/Older round/)).toBeTruthy();
    await user.click(screen.getByRole("option", { name: /Previous findings/ }));
    expect(screen.getByText(/Open original evidence/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Old issue" }));
    const evidence = screen.getByRole("button", { name: /a.ts/ });
    expect(evidence.hasAttribute("disabled")).toBe(true);
    await user.click(evidence);
    await user.click(screen.getByRole("tab", { name: /Requirements/ }));
    const requirementEvidence = screen.getByRole("button", {
      name: /requirement.ts/,
    });
    expect(requirementEvidence.hasAttribute("disabled")).toBe(true);
    await user.click(requirementEvidence);
    expect(onEvidence).not.toHaveBeenCalled();
  },
);

test.each(["task", "verification"])(
  "finding %s actions show pending feedback and open the matching Work tab",
  async (kind) => {
    const review = savedReviewSchema.parse({
      id: "a1b2c3d4-1234-4234-8234-123456789012",
      protocolVersion: 1,
      source: {
        kind: "working-tree",
        base: "a".repeat(40),
        head: null,
        firstParent: false,
      },
      files: [],
      excluded: [],
      title: "Fixture",
      hash: "a".repeat(64),
      fingerprint: "a".repeat(64),
      round: 1,
      createdAt: "2026-10-25T00:00:00.000Z",
      updatedAt: "2026-10-25T00:00:00.000Z",
      revision: 0,
      notes: [],
      completedPaths: [],
      selectedPath: null,
    });
    const finding = trackedFindingSchema.parse({
      id: "b1b2c3d4-1234-4234-8234-123456789012",
      reviewId: review.id,
      decision: "open",
      observations: [
        {
          id: "c1b2c3d4-1234-4234-8234-123456789012",
          jobId: "d1b2c3d4-1234-4234-8234-123456789012",
          review: { id: review.id, hash: review.hash, round: 1 },
          createdAt: review.createdAt,
          evidence: {
            title: "Missing guard",
            severity: "high",
            problem: "Missing guard crashes.",
            path: "a.ts",
            side: "after",
            start: 1,
            end: 1,
            code: "input.value",
            fixPrompt: "Add guard",
            category: "correctness",
          },
        },
      ],
      history: [],
      possibleMatches: [],
      duplicateOf: null,
      assessment: null,
    });
    workflowFeedback.data = {
      findings: [finding],
      tasks: [],
      checks: [],
      verifications: [],
      suggestedCommands: [],
      rounds: [review],
      policy: projectPolicySchema.parse({}),
      usage: [],
    };
    let finish!: (value: unknown) => void;
    workflowFeedback.act.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const info = vi.spyOn(toast, "info");
    const success = vi.spyOn(toast, "success");
    render(
      <AgentPanel
        snapshotId={review.id}
        snapshot={{
          ...review,
          status: "ready",
          expectedFiles: review.files.length,
          error: null,
        }}
        agents={{ state: { data: { jobs: [] } } } as never}
        onEvidence={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "Work" }));
    await user.click(screen.getByRole("tab", { name: "Checks" }));
    await user.click(screen.getByRole("tab", { name: "Review" }));
    await user.click(
      screen.getByRole("checkbox", { name: "Select Missing guard" }),
    );
    if (kind === "task") {
      await user.click(screen.getByRole("button", { name: "Create fix task" }));
      await user.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "Create fix task",
        }),
      );
    } else {
      const verify = screen.getByRole("button", {
        name: "Verify selected findings",
      });
      await user.click(verify);
      expect(verify.hasAttribute("disabled")).toBe(true);
      await user.click(verify);
    }
    expect(workflowFeedback.act).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      kind === "task" ? "Creating fix task…" : "Queueing verification…",
    );
    finish({ id: "accepted" });
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: "Work" }).getAttribute("aria-selected"),
      ).toBe("true"),
    );
    expect(
      screen
        .getByRole("tab", {
          name: kind === "task" ? "Fix tasks" : "Verification",
        })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(success).toHaveBeenCalledWith(
      kind === "task" ? "Fix task created." : "Verification queued.",
    );
  },
);
