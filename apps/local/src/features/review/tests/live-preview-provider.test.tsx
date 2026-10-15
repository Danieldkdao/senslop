// @vitest-environment jsdom
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  LivePreviewProvider,
  useLivePreview,
} from "../components/live-preview-provider";

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast: feedback }));
const Consumer = () => {
  const { preview, error, discardReview, refresh, changeReview } =
    useLivePreview();
  return (
    <div>
      {preview?.files[0]?.path ?? "Empty"}
      {error}
      <button onClick={() => void discardReview().catch(() => {})}>
        Discard
      </button>
      <button onClick={() => void refresh()}>Reload</button>
      <button
        onClick={() =>
          void changeReview({
            action: "select",
            path: preview!.files[0]!.path,
          }).catch(() => {})
        }
      >
        Change
      </button>
    </div>
  );
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("local polling restores snapshots after reload, skips unchanged results and keeps files on connection failure", async () => {
  vi.useFakeTimers();
  const snapshot = {
    id: "b7abed53-2d2b-489d-8cd6-fc4721b8d404",
    protocolVersion: 1,
    source: {
      kind: "working-tree",
      base: "a".repeat(40),
      head: null,
      firstParent: false,
    },
    files: [
      {
        path: "local.ts",
        oldPath: null,
        status: "A",
        before: null,
        after: "one",
        beforeHash: null,
        afterHash: "a".repeat(64),
        binary: false,
        added: 1,
        deleted: 0,
        diff: "",
      },
    ],
    excluded: [],
  };
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => snapshot });
  vi.stubGlobal("fetch", fetcher);
  render(
    <LivePreviewProvider>
      <Consumer />
    </LivePreviewProvider>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText("local.ts")).toBeTruthy();
  expect(fetcher).toHaveBeenCalledWith(
    "/api/preview",
    expect.objectContaining({ cache: "no-store" }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(feedback.success).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id: "invalid" }),
  });
  fireEvent.click(screen.getByText("Change"));
  await act(async () => {});
  expect(feedback.error).toHaveBeenCalledWith(
    "The saved review response could not be read. Retry.",
  );
  expect(screen.getByText("local.ts")).toBeTruthy();
  fetcher.mockRejectedValue(new Error("Stopped"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByText(/local.ts/)).toBeTruthy();
  expect(screen.getByText(/local app is unavailable/i)).toBeTruthy();
  cleanup();
  const count = fetcher.mock.calls.length;
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetcher).toHaveBeenCalledTimes(count);
});

test("invalid local responses never replace a usable snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ files: [{ path: "bad.ts" }] }),
    }),
  );
  render(
    <LivePreviewProvider>
      <Consumer />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  expect(screen.getByText(/Empty/)).toBeTruthy();
  expect(screen.queryByText("bad.ts")).toBeNull();
});
test("local storage recovery messages reach the browser", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        message: "Upgrade the CLI to open this local data.",
      }),
    }),
  );
  render(
    <LivePreviewProvider>
      <Consumer />
    </LivePreviewProvider>,
  );
  expect(await screen.findByText(/Upgrade the CLI/)).toBeTruthy();
});

test("discard removes the active review durably and polling cannot restore it", async () => {
  const snapshot = {
    id: "b7abed53-2d2b-489d-8cd6-fc4721b8d404",
    protocolVersion: 1,
    source: {
      kind: "working-tree",
      base: "a".repeat(40),
      head: null,
      firstParent: false,
    },
    files: [
      {
        path: "discarded.ts",
        oldPath: null,
        status: "A",
        before: null,
        after: "one",
        beforeHash: null,
        afterHash: "a".repeat(64),
        binary: false,
        added: 1,
        deleted: 0,
        diff: "",
      },
    ],
    excluded: [],
  };
  let active: typeof snapshot | null = snapshot;
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === "POST") {
      active = null;
      return Response.json(null);
    }
    return Response.json(active);
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <LivePreviewProvider>
      <Consumer />
    </LivePreviewProvider>,
  );
  await screen.findByText("discarded.ts");
  fireEvent.click(screen.getByText("Discard"));
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      "/api/workspace",
      expect.objectContaining({
        body: JSON.stringify({ action: "delete", id: snapshot.id }),
      }),
    ),
  );
  await waitFor(() => expect(active).toBeNull());
  fireEvent.click(screen.getByText("Reload"));
  await act(async () => {});
  expect(screen.getByText("Empty")).toBeTruthy();
});
