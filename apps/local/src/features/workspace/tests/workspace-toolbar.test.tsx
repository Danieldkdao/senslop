// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LivePreview } from "../../review/types";
import { toast } from "@/components/ui/toast";
import { WorkspaceToolbar } from "../components/workspace-toolbar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

const groupingPreference = vi.hoisted(() => ({
  mode: "always",
  configured: false,
}));
vi.mock("../../agents/hooks/use-ai-settings", () => ({
  useAiSettings: () => ({
    settings: {
      data: {
        groupingMode: groupingPreference.mode,
        shared: groupingPreference.configured ? {} : null,
      },
    },
  }),
}));
const context = vi.hoisted(() => ({
  preview: null as LivePreview | null,
  refresh: vi.fn(),
  openReview: vi.fn(),
  trackReviewOperation: vi.fn(),
}));
vi.mock("../../review/components/live-preview-provider", () => ({
  useLivePreview: () => context,
}));
vi.mock("@/components/ui/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const QueryProvider = ({ children }: { children: ReactNode }) => {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

afterEach(() => {
  cleanup();
  context.preview = null;
  groupingPreference.mode = "always";
  groupingPreference.configured = false;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const metadata = {
  directory: "/opened/repo",
  root: "/opened/repo",
  repository: {
    root: "/opened/repo",
    branch: "feature",
    head: "a".repeat(40),
    fingerprint: "b".repeat(64),
    commits: [{ id: "a".repeat(40), subject: "latest", date: "2026-10-09" }],
    branches: ["feature", "main"],
  },
  history: [],
};

const shortcutReviews = ["Newest", "Middle", "Oldest"].map((title, index) => ({
  repository: "/opened/repo",
  directory: "/opened/repo",
  id: `00000000-0000-4000-8000-00000000000${index}`,
  title,
  createdAt: "2026-10-17",
  updatedAt: "2026-10-17",
  hash: "a".repeat(64),
  kind: "commit",
  fileCount: 1,
  noteCount: 0,
  completedCount: 0,
}));

const setupReviewShortcuts = () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const initialPreview = {
    id: shortcutReviews[1]!.id,
    status: "ready",
    files: [],
    excluded: [],
    source: { kind: "commit", base: metadata.repository.head },
  } as unknown as LivePreview;
  context.preview = initialPreview;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      context.preview = { ...initialPreview, ...context.preview, id: body.id };
    }
    return {
      ok: true,
      json: async () => ({ ...metadata, history: shortcutReviews }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};

test("R opens saved reviews with focused search; list arrows and Enter open a review", async () => {
  const fetcher = setupReviewShortcuts();
  context.preview = null;
  const user = userEvent.setup();
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  fireEvent.keyDown(document, { key: "r" });
  const search = await screen.findByLabelText("Search saved reviews");
  await waitFor(() => expect(document.activeElement).toBe(search));
  await screen.findByText("Newest");
  await user.type(search, "r[BracketLeft][BracketRight]");
  expect(
    fetcher.mock.calls.some(([, options]) => options?.method === "POST"),
  ).toBe(false);
  await user.clear(search);
  await waitFor(() =>
    expect(screen.queryByText("Searching local reviews…")).toBeNull(),
  );
  await user.keyboard("{ArrowDown}{Enter}");
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({
        body: JSON.stringify({ action: "open", id: shortcutReviews[1]!.id }),
      }),
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.keyDown(document, { key: "r" });
  await screen.findByRole("dialog");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("brackets switch through fresh history in list order and stop at both ends", async () => {
  const fetcher = setupReviewShortcuts();
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  const openedIds = () =>
    fetcher.mock.calls
      .filter(([, options]) => options?.method === "POST")
      .map(([, options]) => JSON.parse(String(options?.body)).id);
  fireEvent.keyDown(document, { key: "[" });
  await waitFor(() => expect(openedIds()).toEqual([shortcutReviews[0]!.id]));
  await waitFor(() => expect(context.refresh).toHaveBeenCalledTimes(1));
  fireEvent.keyDown(document, { key: "[" });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("history=1")),
    ).toHaveLength(2),
  );
  expect(openedIds()).toHaveLength(1);
  fireEvent.keyDown(document, { key: "]" });
  await waitFor(() => expect(openedIds()).toHaveLength(2));
  await waitFor(() => expect(context.refresh).toHaveBeenCalledTimes(2));
  fireEvent.keyDown(document, { key: "]" });
  await waitFor(() =>
    expect(openedIds()).toEqual([
      shortcutReviews[0]!.id,
      shortcutReviews[1]!.id,
      shortcutReviews[2]!.id,
    ]),
  );
  await waitFor(() => expect(context.refresh).toHaveBeenCalledTimes(3));
  fireEvent.keyDown(document, { key: "]" });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([url]) => url.includes("history=1")),
    ).toHaveLength(5),
  );
  expect(openedIds()).toHaveLength(3);
});

test.each([
  { ctrlKey: true },
  { metaKey: true },
  { altKey: true },
  { shiftKey: true },
  { isComposing: true },
  { repeat: true },
])(
  "review shortcuts ignore reserved modifiers, composition, and held keys: %j",
  async (options) => {
    const fetcher = setupReviewShortcuts();
    render(<WorkspaceToolbar />, { wrapper: QueryProvider });
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    for (const key of ["r", "[", "]"]) {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
        ...options,
      });
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url.includes("history=1"))).toBe(
      false,
    );
  },
);

test("review shortcuts leave editable controls, shadow-root inputs, overlays, and handled events alone", async () => {
  const fetcher = setupReviewShortcuts();
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  const host = document.createElement("div");
  document.body.append(host);
  for (const target of [
    document.createElement("input"),
    document.createElement("textarea"),
    document.createElement("select"),
    document.createElement("div"),
  ]) {
    if (target.tagName === "DIV") {
      target.setAttribute("contenteditable", "true");
      // JSDOM does not implement the browser's isContentEditable property.
      Object.defineProperty(target, "isContentEditable", { value: true });
    }
    host.append(target);
    for (const key of ["r", "[", "]"]) fireEvent.keyDown(target, { key });
  }
  const shadowInput = document.createElement("textarea");
  host.attachShadow({ mode: "open" }).append(shadowInput);
  for (const key of ["r", "[", "]"])
    fireEvent.keyDown(shadowInput, { key, composed: true });
  for (const role of ["dialog", "menu", "listbox"]) {
    host.setAttribute("role", role);
    for (const key of ["r", "[", "]"]) fireEvent.keyDown(document, { key });
  }
  host.removeAttribute("role");
  host.setAttribute("data-slot", "popover-content");
  for (const key of ["r", "[", "]"]) fireEvent.keyDown(document, { key });
  host.remove();
  const handled = new KeyboardEvent("keydown", {
    key: "r",
    bubbles: true,
    cancelable: true,
  });
  handled.preventDefault();
  document.dispatchEvent(handled);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetcher.mock.calls.some(([url]) => url.includes("history=1"))).toBe(
    false,
  );
});

test("review shortcuts can be disabled while the saved reviews button remains usable", async () => {
  const fetcher = setupReviewShortcuts();
  const user = userEvent.setup();
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  fireEvent.keyDown(document, { key: "r" });
  await user.click(
    await screen.findByRole("switch", { name: "Review keyboard shortcuts" }),
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  const before = fetcher.mock.calls.length;
  for (const key of ["r", "[", "]"]) fireEvent.keyDown(document, { key });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(before);
  await user.click(screen.getByRole("button", { name: "Saved reviews" }));
  await screen.findByRole("dialog");
  await user.click(
    screen.getByRole("switch", { name: "Review keyboard shortcuts" }),
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.keyDown(document, { key: "r" });
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

test("a pending review switch blocks overlapping keys and failures show a retryable toast", async () => {
  const fetcher = setupReviewShortcuts();
  let finish!: (value: Awaited<ReturnType<typeof fetcher>>) => void;
  fetcher.mockImplementation(async (_url, options) => {
    if (options?.method === "POST")
      return new Promise((resolve) => {
        finish = resolve;
      });
    return {
      ok: true,
      json: async () => ({ ...metadata, history: shortcutReviews }),
    };
  });
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  fireEvent.keyDown(document, { key: "]" });
  fireEvent.keyDown(document, { key: "[" });
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  fireEvent.keyDown(document, { key: "]" });
  fireEvent.keyDown(document, { key: "r" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
  finish({
    ok: false,
    json: async () => ({
      ...metadata,
      history: shortcutReviews,
      message: "Saved review not found. Retry.",
    }),
  });
  await waitFor(() =>
    expect(toast.error).toHaveBeenCalledWith("Saved review not found. Retry."),
  );
  fireEvent.keyDown(document, { key: "r" });
  expect(await screen.findByRole("dialog")).toBeTruthy();
});

test("review shortcuts stop after unmount", () => {
  setupReviewShortcuts();
  const view = render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  view.unmount();
  const event = new KeyboardEvent("keydown", {
    key: "r",
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
});
test("browser inspection defaults to uncommitted changes and latest commit uses local HEAD", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => metadata });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  expect(screen.queryByLabelText("Changes to inspect")).toBeNull();
  await user.click(screen.getByRole("button", { name: "New review" }));
  expect(await screen.findByText(/\/opened\/repo/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/workspace",
    expect.objectContaining({
      body: JSON.stringify({
        action: "inspect",
        source: { kind: "working-tree" },
        activate: true,
      }),
    }),
  );
  await user.click(screen.getByRole("button", { name: "New review" }));
  await user.click(screen.getByLabelText("Changes to inspect"));
  await user.click(
    await screen.findByRole("option", { name: "Single commit" }),
  );
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  expect(fetcher).toHaveBeenCalledWith(
    "/api/workspace",
    expect.objectContaining({
      body: JSON.stringify({
        action: "inspect",
        source: { kind: "commit", commit: "HEAD" },
        activate: true,
      }),
    }),
  );
});
test("Git errors preserve selections and expose retry, branch base is optional", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => metadata });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  expect(screen.queryByLabelText("Changes to inspect")).toBeNull();
  await user.click(screen.getByRole("button", { name: "New review" }));
  await screen.findByText(/\/opened\/repo/);
  await user.click(screen.getByLabelText("Changes to inspect"));
  await user.click(
    await screen.findByRole("option", { name: "Branch comparison" }),
  );
  await user.click(screen.getByLabelText("Compare branch"));
  await user.click(await screen.findByRole("option", { name: "main" }));
  fetcher.mockImplementation(async (_url: string, options?: RequestInit) =>
    options?.method === "POST"
      ? {
          ok: false,
          json: async () => ({ message: "Git unavailable. Retry." }),
        }
      : { ok: true, json: async () => metadata },
  );
  await user.click(screen.getByRole("button", { name: "Inspect changes" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Git unavailable"),
  );
  await user.click(screen.getByRole("button", { name: "Retry inspection" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({
        body: JSON.stringify({
          action: "inspect",
          source: { kind: "branch", branch: "main", base: "HEAD" },
          activate: true,
        }),
      }),
    ),
  );
});

test("re-sync is enabled only for an uncommitted review on the captured branch and HEAD", async () => {
  context.preview = {
    files: [],
    excluded: [],
    expectedFiles: 0,
    status: "ready",
    error: null,
    id: "round-one",
    round: 1,
    fingerprint: "e".repeat(64),
    hash: "c".repeat(64),
    source: {
      kind: "working-tree",
      base: metadata.repository.head,
      head: null,
      firstParent: false,
    },
    repositoryState: { branch: "feature", head: metadata.repository.head },
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => metadata });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const { rerender } = render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  const button = () => screen.getByRole("button", { name: "Re-sync review" });
  await waitFor(() => expect(button().hasAttribute("disabled")).toBe(false));
  await user.click(button());
  await user.click(screen.getByRole("button", { name: "Start re-sync" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({
        body: JSON.stringify({
          action: "resync",
          id: "round-one",
          expectedHash: "c".repeat(64),
          expectedRound: 1,
          mode: "new",
          activate: true,
        }),
      }),
    ),
  );
  context.preview = {
    ...context.preview!,
    repositoryState: { branch: "other", head: metadata.repository.head },
  };
  rerender(<WorkspaceToolbar />);
  expect(button().hasAttribute("disabled")).toBe(true);
  context.preview = {
    ...context.preview!,
    repositoryState: { branch: "feature", head: "d".repeat(40) },
  };
  rerender(<WorkspaceToolbar />);
  expect(button().hasAttribute("disabled")).toBe(true);
  context.preview = { ...context.preview!, repositoryState: undefined };
  rerender(<WorkspaceToolbar />);
  expect(button().hasAttribute("disabled")).toBe(true);
});

test("re-sync offers a cumulative mode before submitting", async () => {
  context.preview = {
    id: "round",
    hash: "c".repeat(64),
    round: 1,
    status: "ready",
    fingerprint: "e".repeat(64),
    files: [],
    excluded: [],
    source: { kind: "working-tree", base: metadata.repository.head },
    repositoryState: { branch: "feature", head: metadata.repository.head },
  } as unknown as LivePreview;
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => metadata });
  vi.stubGlobal("fetch", fetcher);
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Re-sync review" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Re-sync review" }));
  expect(fetcher.mock.calls.some((call) => call[1]?.method === "POST")).toBe(
    false,
  );
  await user.click(
    screen.getByRole("combobox", { name: "Changes to re-sync" }),
  );
  await user.click(
    await screen.findByRole("option", {
      name: "Keep current changes and add newer edits",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Start re-sync" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({
        body: JSON.stringify({
          action: "resync",
          id: "round",
          expectedHash: "c".repeat(64),
          expectedRound: 1,
          mode: "keep",
          activate: true,
        }),
      }),
    ),
  );
});

test("ask grouping mode exposes a toggle and submits the selected choice", async () => {
  groupingPreference.mode = "ask";
  groupingPreference.configured = true;
  context.preview = {
    id: "round",
    hash: "c".repeat(64),
    round: 1,
    status: "ready",
    fingerprint: "e".repeat(64),
    files: [],
    excluded: [],
    source: { kind: "working-tree", base: metadata.repository.head },
    repositoryState: { branch: "feature", head: metadata.repository.head },
  } as unknown as LivePreview;
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => metadata });
  vi.stubGlobal("fetch", fetcher);
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  const user = userEvent.setup();
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Re-sync review" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  await user.click(screen.getByRole("button", { name: "Re-sync review" }));
  await user.click(
    screen.getByRole("switch", { name: "Group changes and write summaries" }),
  );
  await user.click(screen.getByRole("button", { name: "Start re-sync" }));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({
        body: JSON.stringify({
          action: "resync",
          id: "round",
          expectedHash: "c".repeat(64),
          expectedRound: 1,
          mode: "new",
          grouping: false,
          activate: true,
        }),
      }),
    ),
  );
});

test.each([true, false])(
  "inspection registers its own readiness event without prematurely announcing success when grouping is %s",
  async (groupingEnabled) => {
    const snapshot = {
      id: crypto.randomUUID(),
      protocolVersion: 1,
      source: {
        kind: "working-tree",
        base: metadata.repository.head,
        head: null,
        firstParent: false,
      },
      files: [],
      excluded: [],
      groupingEnabled,
      round: 1,
      title: "Review",
      hash: "a".repeat(64),
      fingerprint: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      revision: 0,
      notes: [],
      completedPaths: [],
      selectedPath: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => ({
        ok: true,
        json: async () => (options?.method === "POST" ? snapshot : metadata),
      })),
    );
    const user = userEvent.setup();
    render(<WorkspaceToolbar />, { wrapper: QueryProvider });
    await user.click(screen.getByRole("button", { name: "New review" }));
    await user.click(
      await screen.findByRole("button", { name: "Inspect changes" }),
    );
    await waitFor(() =>
      expect(context.trackReviewOperation).toHaveBeenCalledWith({
        snapshotId: snapshot.id,
        hash: snapshot.hash,
        mode: "inspect",
      }),
    );
    expect(toast.success).not.toHaveBeenCalled();
  },
);

test.each([
  [
    "unchanged",
    "No new changes to re-sync. Edit the repository, then refresh.",
  ],
  [
    "missing fingerprint",
    "Repository freshness is unavailable. Refresh the repository and retry.",
  ],
  [
    "unavailable",
    "Repository unavailable. Check Git and refresh the repository.",
  ],
  [
    "different branch",
    "The Git branch or HEAD changed. Start a new review for this repository state.",
  ],
  [
    "commit review",
    "Re-sync is available only for uncommitted-changes reviews. Start a new review.",
  ],
  [
    "receiving",
    "Wait for the current changes to finish loading before re-syncing.",
  ],
  ["grouping", "Wait for grouping to finish or stop it before re-syncing."],
])("re-sync explains why it is unavailable when %s", async (state, reason) => {
  context.preview = {
    id: "round",
    hash: "c".repeat(64),
    round: 1,
    status: "ready",
    fingerprint:
      state === "unchanged" ? metadata.repository.fingerprint : "e".repeat(64),
    files: [],
    excluded: [],
    source: { kind: "working-tree", base: metadata.repository.head },
    repositoryState: {
      branch: state === "different branch" ? "other" : "feature",
      head: metadata.repository.head,
    },
  } as unknown as LivePreview;
  if (state === "commit review") context.preview.source.kind = "commit";
  if (state === "receiving") context.preview.status = "receiving";
  const currentMetadata = {
    ...metadata,
    repository:
      state === "unavailable"
        ? null
        : {
            ...metadata.repository,
            fingerprint:
              state === "missing fingerprint"
                ? null
                : metadata.repository.fingerprint,
          },
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => currentMetadata });
  vi.stubGlobal("fetch", fetcher);
  render(<WorkspaceToolbar preparing={state === "grouping"} />, {
    wrapper: QueryProvider,
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Re-sync review" })
        .hasAttribute("disabled"),
    ).toBe(true),
  );
  expect(await screen.findByLabelText(reason)).toBeTruthy();
  expect(fetcher.mock.calls.some((call) => call[1]?.method === "POST")).toBe(
    false,
  );
});

test("a failed metadata refresh disables re-sync even with previously cached data", async () => {
  context.preview = {
    id: "round",
    hash: "c".repeat(64),
    round: 1,
    status: "ready",
    fingerprint: "e".repeat(64),
    files: [],
    excluded: [],
    source: { kind: "working-tree", base: metadata.repository.head },
    repositoryState: { branch: "feature", head: metadata.repository.head },
  } as unknown as LivePreview;
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => metadata });
  vi.stubGlobal("fetch", fetcher);
  render(<WorkspaceToolbar />, { wrapper: QueryProvider });
  const button = () => screen.getByRole("button", { name: "Re-sync review" });
  await waitFor(() => expect(button().hasAttribute("disabled")).toBe(false));
  fetcher.mockRejectedValue(new Error("Git unavailable"));
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Refresh repository" }));
  await waitFor(() => expect(button().hasAttribute("disabled")).toBe(true));
  expect(
    await screen.findByLabelText(
      "Repository unavailable. Check Git and refresh the repository.",
    ),
  ).toBeTruthy();
});
