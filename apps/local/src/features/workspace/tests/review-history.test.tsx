// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewHistory } from "../components/review-history";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { onlineManager } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

const QueryProvider = ({ children }: { children: ReactNode }) => {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  onlineManager.setOnline(true);
  vi.unstubAllGlobals();
});

test("local history can load while the browser reports no internet connectivity", async () => {
  onlineManager.setOnline(false);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [review] }),
    }),
  );
  render(<ReviewHistory open onOpenChange={vi.fn()} onAction={vi.fn()} />, {
    wrapper: QueryProvider,
  });
  expect(await screen.findByText(review.title)).toBeTruthy();
});
const review = {
  id: "9cf6e565-c38e-48aa-a5aa-aac759789b6c",
  title: "Fix API",
  repository: "/work",
  directory: "/work/current",
  createdAt: "2026-10-09",
  updatedAt: "2026-10-09",
  hash: "a".repeat(64),
  fileCount: 3,
  noteCount: 2,
  completedCount: 1,
  kind: "commit",
};

test("history groups reviews by full folder path with the current folder first and monospace headings", async () => {
  const otherReview = {
    ...review,
    id: crypto.randomUUID(),
    title: "Other project review",
    directory: "/work/another",
  };
  const olderReview = {
    ...review,
    id: crypto.randomUUID(),
    title: "Older review",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          {
            ...review,
            id: crypto.randomUUID(),
            title: "Legacy review",
            directory: null,
          },
          otherReview,
          review,
          olderReview,
        ],
      }),
    }),
  );
  render(
    <ReviewHistory
      open
      currentDirectory={review.directory}
      onOpenChange={vi.fn()}
      onAction={vi.fn()}
    />,
    { wrapper: QueryProvider },
  );
  await screen.findByText(review.title);
  const groups = screen.getAllByRole("group", {
    name: /\/work\/current|\/work\/another|Folder not recorded/,
  });
  expect(groups).toHaveLength(3);
  expect(groups[0]).toBe(
    screen.getByRole("group", { name: /\/work\/current.*Current folder/ }),
  );
  expect(groups[1]).toBe(
    screen.getByRole("group", { name: otherReview.directory }),
  );
  expect(groups[2]).toBe(
    screen.getByRole("group", { name: "Folder not recorded" }),
  );
  expect(
    within(groups[0]!)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual([
    expect.stringContaining(review.title),
    expect.stringContaining(olderReview.title),
  ]);
  expect(
    screen.getByText(review.directory).classList.contains("font-mono"),
  ).toBe(true);
  expect(
    screen.getByText(otherReview.directory).classList.contains("font-mono"),
  ).toBe(true);
  expect(screen.getByLabelText("Current folder")).toBeTruthy();
});

test("folder searches use the debounced server query and retain folder grouping", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ history: [review] }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(
    <ReviewHistory
      open
      currentDirectory={review.directory}
      onOpenChange={vi.fn()}
      onAction={vi.fn()}
    />,
    { wrapper: QueryProvider },
  );
  await screen.findByText(review.title);
  await user.type(
    screen.getByLabelText("Search saved reviews"),
    "/work/current",
  );
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace?history=1&search=%2Fwork%2Fcurrent",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ),
  );
  expect(
    await screen.findByRole("group", { name: /\/work\/current/ }),
  ).toBeTruthy();
});

test("history initially highlights the current review and search can select a different review", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const currentReview = {
    ...review,
    id: crypto.randomUUID(),
    title: "Current review",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({
        history: url.endsWith("search=Fix")
          ? [review]
          : [review, currentReview],
      }),
    })),
  );
  const user = userEvent.setup();
  const action = vi.fn().mockResolvedValue(true);
  render(
    <ReviewHistory
      open
      currentReviewId={currentReview.id}
      onOpenChange={vi.fn()}
      onAction={action}
    />,
    { wrapper: QueryProvider },
  );
  await screen.findByText(currentReview.title);
  await waitFor(() =>
    expect(
      screen
        .getByRole("option", { name: /Current review/ })
        .getAttribute("aria-selected"),
    ).toBe("true"),
  );
  await user.type(screen.getByLabelText("Search saved reviews"), "Fix");
  await waitFor(() =>
    expect(screen.queryByText(currentReview.title)).toBeNull(),
  );
  await screen.findByRole("option", { name: /Fix API/ });
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({ action: "open", id: review.id }),
  );
});

test("search fetches debounced database results; command rows retain details and Enter reopens", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ history: [review] }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  const action = vi.fn().mockResolvedValue(true);
  const close = vi.fn();
  render(<ReviewHistory open onOpenChange={close} onAction={action} />, {
    wrapper: QueryProvider,
  });
  expect(await screen.findByText(/3 files/)).toBeTruthy();
  const initialCalls = fetcher.mock.calls.length;
  await user.type(screen.getByLabelText("Search saved reviews"), "Fix");
  expect(fetcher.mock.calls.length).toBe(initialCalls);
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace?history=1&search=Fix",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ),
  );
  expect(fetcher.mock.calls.length).toBe(initialCalls + 1);
  await screen.findByRole("option");
  await user.keyboard("{Enter}");
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({ action: "open", id: review.id }),
  );
  expect(close).toHaveBeenCalledWith(false);
});
test("rename and delete icon actions do not reopen; rename is inline and deletion requires confirmation", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ history: [review] }),
    }),
  );
  const user = userEvent.setup();
  const action = vi.fn().mockResolvedValue(true);
  render(<ReviewHistory open onOpenChange={vi.fn()} onAction={action} />, {
    wrapper: QueryProvider,
  });
  await user.click(
    await screen.findByRole("button", { name: "Rename Fix API" }),
  );
  await user.clear(screen.getByLabelText("Review name"));
  await user.type(screen.getByLabelText("Review name"), "New title{Enter}");
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({
      action: "change",
      id: review.id,
      expectedHash: review.hash,
      expectedRound: 1,
      change: { action: "rename", title: "New title" },
    }),
  );
  expect(action.mock.calls.some(([body]) => body.action === "open")).toBe(
    false,
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByLabelText("Search saved reviews"),
    ),
  );
  await user.click(
    await screen.findByRole("button", { name: "Delete Fix API" }),
  );
  expect(action.mock.calls.some(([body]) => body.action === "delete")).toBe(
    false,
  );
  const confirmation = await screen.findByRole("dialog", {
    name: "Delete this review?",
  });
  await user.click(
    within(confirmation).getByRole("button", { name: "Cancel" }),
  );
  expect(action.mock.calls.some(([body]) => body.action === "delete")).toBe(
    false,
  );
  await user.click(screen.getByRole("button", { name: "Delete Fix API" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({
      action: "delete",
      id: review.id,
      expectedHash: review.hash,
      expectedRound: 1,
    }),
  );
});

test("closed history does not fetch; reopening refetches current saved reviews", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ history: [review] }) });
  vi.stubGlobal("fetch", fetcher);
  const props = { onOpenChange: vi.fn(), onAction: vi.fn() };
  const { rerender } = render(<ReviewHistory {...props} open={false} />, {
    wrapper: QueryProvider,
  });
  expect(fetcher).not.toHaveBeenCalled();
  rerender(<ReviewHistory {...props} open />);
  await screen.findByText(review.title);
  rerender(<ReviewHistory {...props} open={false} />);
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({
      history: [{ ...review, title: "Updated outside dialog" }],
    }),
  });
  rerender(<ReviewHistory {...props} open />);
  expect(await screen.findByText("Updated outside dialog")).toBeTruthy();
  expect(screen.queryByText(review.title)).toBeNull();
});

test("history exposes a recoverable error and retry reloads database results", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValue({ ok: true, json: async () => ({ history: [review] }) });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<ReviewHistory open onOpenChange={vi.fn()} onAction={vi.fn()} />, {
    wrapper: QueryProvider,
  });
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("unavailable"),
  );
  await user.click(screen.getByRole("button", { name: "Retry history" }));
  expect(await screen.findByText(review.title)).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("a superseded query is aborted and its late response cannot replace search results", async () => {
  let finishInitial!: (value: unknown) => void;
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishInitial = resolve;
        }),
    )
    .mockResolvedValue({
      ok: true,
      json: async () => ({ history: [{ ...review, title: "Latest result" }] }),
    });
  vi.stubGlobal("fetch", fetcher);
  const user = userEvent.setup();
  render(<ReviewHistory open onOpenChange={vi.fn()} onAction={vi.fn()} />, {
    wrapper: QueryProvider,
  });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  await user.type(screen.getByLabelText("Search saved reviews"), "Latest");
  await waitFor(() => expect(signal.aborted).toBe(true));
  finishInitial({ ok: true, json: async () => ({ history: [review] }) });
  expect(await screen.findByText("Latest result")).toBeTruthy();
  expect(screen.queryByText(review.title)).toBeNull();
});

test("history exposes compact snapshot and analysis status icons with keyboard and hover tooltips", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        history: [
          {
            ...review,
            work: [
              {
                id: "group",
                kind: "grouping",
                status: "queued",
                progress: "Waiting for capacity",
                error: null,
              },
              {
                id: "analysis",
                kind: "review",
                status: "failed",
                progress: "Stopped",
                error: "Model unavailable",
              },
            ],
          },
        ],
      }),
    }),
  );
  const user = userEvent.setup();
  const onAction = vi.fn();
  render(<ReviewHistory open onOpenChange={vi.fn()} onAction={onAction} />, {
    wrapper: QueryProvider,
  });
  const snapshot = await screen.findByRole("img", {
    name: "Snapshot ready to read",
  });
  const grouping = screen.getByRole("img", {
    name: "Grouping: Queued — Waiting for capacity",
  });
  const correctness = screen.getByRole("img", {
    name: "Correctness: Failed — Model unavailable",
  });
  expect(snapshot.textContent).toBe("");
  expect(grouping.textContent).toBe("");
  expect(correctness.textContent).toBe("");
  await user.tab();
  expect(document.activeElement).toBe(snapshot);
  expect(await screen.findByText("Snapshot ready to read")).toBeTruthy();
  await user.keyboard("{Enter}");
  expect(onAction).not.toHaveBeenCalled();
  await user.tab();
  expect(document.activeElement).toBe(grouping);
  expect(
    await screen.findByText("Grouping: Queued — Waiting for capacity"),
  ).toBeTruthy();
  await user.hover(correctness);
  expect(
    await screen.findByText("Correctness: Failed — Model unavailable"),
  ).toBeTruthy();
  expect(onAction).not.toHaveBeenCalled();
});

test("queued work can be prioritized and canceled without opening its snapshot", async () => {
  const fetcher = vi.fn(async (_url, options) =>
    options?.method === "POST"
      ? Response.json({ saved: true })
      : Response.json({
          history: [
            {
              ...review,
              work: [
                {
                  id: "job",
                  kind: "grouping",
                  status: "queued",
                  priority: "normal",
                  progress: "Waiting",
                  error: null,
                },
              ],
            },
          ],
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  const onAction = vi.fn();
  const user = userEvent.setup();
  render(<ReviewHistory open onOpenChange={vi.fn()} onAction={onAction} />, {
    wrapper: QueryProvider,
  });
  const prioritize = await screen.findByRole("button", {
    name: "Prioritize grouping",
  });
  expect(prioritize.textContent).toBe("");
  await user.hover(prioritize);
  expect(await screen.findByText("Prioritize grouping")).toBeTruthy();
  await user.click(prioritize);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/agents",
    expect.objectContaining({
      body: JSON.stringify({ action: "priority", id: "job", priority: "high" }),
    }),
  );
  const cancel = await screen.findByRole("button", { name: "Cancel grouping" });
  expect(cancel.textContent).toBe("");
  await user.hover(cancel);
  expect(await screen.findByText("Cancel grouping")).toBeTruthy();
  await user.click(cancel);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/agents",
    expect.objectContaining({
      body: JSON.stringify({ action: "cancel", id: "job" }),
    }),
  );
  expect(onAction).not.toHaveBeenCalled();
});

test("failed work retries through an icon button without opening its snapshot", async () => {
  const fetcher = vi.fn(async (_url, options) =>
    options?.method === "POST"
      ? Response.json({ saved: true })
      : Response.json({
          history: [
            {
              ...review,
              work: [
                {
                  id: "failed-job",
                  kind: "review",
                  status: "failed",
                  priority: "normal",
                  progress: "Stopped",
                  error: "Model unavailable",
                },
              ],
            },
          ],
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  const onAction = vi.fn();
  const user = userEvent.setup();
  render(<ReviewHistory open onOpenChange={vi.fn()} onAction={onAction} />, {
    wrapper: QueryProvider,
  });
  const retry = await screen.findByRole("button", {
    name: "Retry correctness",
  });
  expect(retry.textContent).toBe("");
  await user.hover(retry);
  expect(await screen.findByText("Retry correctness")).toBeTruthy();
  await user.click(retry);
  expect(fetcher).toHaveBeenCalledWith(
    "/api/agents",
    expect.objectContaining({
      body: JSON.stringify({ action: "retry", id: "failed-job" }),
    }),
  );
  expect(onAction).not.toHaveBeenCalled();
});
