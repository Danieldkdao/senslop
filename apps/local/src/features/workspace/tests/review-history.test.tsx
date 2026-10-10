// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewHistory } from "../components/review-history";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { onlineManager } from "@tanstack/react-query";

const QueryProvider = ({ children }: { children: ReactNode }) => {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
  createdAt: "2026-10-09",
  updatedAt: "2026-10-09",
  hash: "a".repeat(64),
  fileCount: 3,
  noteCount: 2,
  completedCount: 1,
  kind: "commit",
};
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
  await user.click(screen.getByRole("button", { name: "Confirm deletion" }));
  await waitFor(() =>
    expect(action).toHaveBeenCalledWith({ action: "delete", id: review.id }),
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
