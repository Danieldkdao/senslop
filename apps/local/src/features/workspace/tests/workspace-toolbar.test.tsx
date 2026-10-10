// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WorkspaceToolbar } from "../components/workspace-toolbar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

const context = vi.hoisted(() => ({ preview: null, refresh: vi.fn() }));
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
