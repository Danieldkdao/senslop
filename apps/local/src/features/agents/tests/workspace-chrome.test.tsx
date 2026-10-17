// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { defaultUiPreferences } from "../../settings/constants";
import { AgentPanel } from "../components/agent-panel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NoteControls } from "../../review/components/note-controls";
import userEvent from "@testing-library/user-event";
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
    expect(screen.getByText(/Evidence navigation is unavailable/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Old issue" }));
    const evidence = screen.getByRole("button", { name: /a.ts/ });
    expect(evidence.hasAttribute("disabled")).toBe(true);
    await user.click(evidence);
    expect(onEvidence).not.toHaveBeenCalled();
  },
);
