// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
          mode: "new",
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
        body: JSON.stringify({ action: "resync", id: "round", mode: "keep" }),
      }),
    ),
  );
});

test("ask grouping mode exposes a toggle and submits the selected choice", async () => {
  groupingPreference.mode = "ask";
  groupingPreference.configured = true;
  context.preview = {
    id: "round",
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
          mode: "new",
          grouping: false,
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
