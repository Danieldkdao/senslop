// @vitest-environment jsdom
import { useEffect } from "react";
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
  window.history.replaceState(null, "", "/");
  sessionStorage.clear();
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

const savedSnapshot = () => ({
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
      path: "file.ts",
      oldPath: null,
      status: "A",
      before: null,
      after: "one",
      beforeHash: null,
      afterHash: "a".repeat(64),
      binary: false,
      added: 1,
      deleted: 0,
      diff: "patch",
    },
  ],
  excluded: [],
  round: 1,
  groupingEnabled: false,
  title: "Review",
  hash: "a".repeat(64),
  fingerprint: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  revision: 0,
  notes: [],
  completedPaths: [] as string[],
  selectedPath: "file.ts",
});

test("a poll superseded by completion releases its unread response body", async () => {
  vi.useFakeTimers();
  const snapshot = savedSnapshot();
  let release!: (response: Response) => void;
  const cancel = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json({ ...snapshot, revision: 1 }));
  vi.stubGlobal("fetch", fetcher);
  let current!: ReturnType<typeof useLivePreview>;
  const Observe = () => {
    const value = useLivePreview();
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  };
  render(
    <LivePreviewProvider>
      <Observe />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await act(async () => {
    await current.changeReview({
      action: "complete",
      path: "file.ts",
      complete: true,
    });
  });
  await act(async () => {
    release(new Response(new ReadableStream({ cancel })));
  });
  expect(cancel).toHaveBeenCalledTimes(1);
});

test("metadata-only writes retain the immutable file objects while updating durable completion", async () => {
  const snapshot = savedSnapshot();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) =>
      Response.json(
        options?.method === "POST"
          ? { ...snapshot, revision: 1, completedPaths: ["file.ts"] }
          : snapshot,
      ),
    ),
  );
  let current!: ReturnType<typeof useLivePreview>;
  const Observe = () => {
    const value = useLivePreview();
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  };
  render(
    <LivePreviewProvider>
      <Observe />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  const firstFile = current.preview!.files[0];
  await act(async () => {
    await current.changeReview({
      action: "complete",
      path: "file.ts",
      complete: true,
    });
  });
  expect(current.preview!.completedPaths).toEqual(["file.ts"]);
  expect(current.preview!.files[0]).toBe(firstFile);
});

test("rapid navigation bounds active writes and coalesces pending selections around completion", async () => {
  const snapshot = savedSnapshot();
  const releases: (() => void)[] = [];
  const writes: { change: { action: string; path: string } }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method !== "POST") return Response.json(snapshot);
      const request = JSON.parse(options.body);
      writes.push(request);
      await new Promise<void>((resolve) => {
        releases.push(resolve);
      });
      return Response.json({ ...snapshot, revision: writes.length });
    }),
  );
  let current!: ReturnType<typeof useLivePreview>;
  const Observe = () => {
    const value = useLivePreview();
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  };
  render(
    <LivePreviewProvider>
      <Observe />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  const pending: Promise<void>[] = [];
  act(() => {
    for (let index = 0; index < 20; index++)
      pending.push(
        current.changeReview({ action: "select", path: `file-${index}.ts` }),
      );
    pending.push(
      current.changeReview({
        action: "complete",
        path: "file-19.ts",
        complete: true,
      }),
    );
    pending.push(current.changeReview({ action: "select", path: "last.ts" }));
  });
  expect(writes).toHaveLength(1);
  while (releases.length)
    await act(async () => {
      releases.shift()!();
    });
  await Promise.all(pending);
  expect(writes.map((write) => write.change)).toEqual([
    { action: "select", path: "file-0.ts" },
    { action: "select", path: "file-19.ts" },
    { action: "complete", path: "file-19.ts", complete: true },
    { action: "select", path: "last.ts" },
  ]);
});

test("completion keeps the preview ETag so the next poll does not download source again", async () => {
  vi.useFakeTimers();
  const snapshot = savedSnapshot();
  const etag = `W/"${snapshot.id}-1"`;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(snapshot))
    .mockResolvedValueOnce(
      Response.json({ ...snapshot, revision: 1 }, { headers: { ETag: etag } }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 304 }));
  vi.stubGlobal("fetch", fetcher);
  let current!: ReturnType<typeof useLivePreview>;
  const Observe = () => {
    const value = useLivePreview();
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  };
  render(
    <LivePreviewProvider>
      <Observe />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  await act(async () => {
    await current.changeReview({
      action: "complete",
      path: "file.ts",
      complete: true,
    });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(fetcher.mock.calls.at(-1)?.[1]?.headers).toEqual({
    "If-None-Match": etag,
  });
});

test("unmounting cancels active and queued writes without leaving completion promises pending", async () => {
  const snapshot = savedSnapshot();
  const fetcher = vi.fn(async (_url, options) => {
    if (options?.method !== "POST") return Response.json(snapshot);
    return new Promise<Response>((_resolve, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(options.signal.reason),
        { once: true },
      ),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  let current!: ReturnType<typeof useLivePreview>;
  const Observe = () => {
    const value = useLivePreview();
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  };
  const mounted = render(
    <LivePreviewProvider>
      <Observe />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  const pending = [
    current.changeReview({
      action: "complete",
      path: "file.ts",
      complete: true,
    }),
    current.changeReview({ action: "select", path: "file.ts" }),
  ].map((promise) => promise.catch((error) => error));
  mounted.unmount();
  expect((await Promise.all(pending)).map((error) => error.name)).toEqual([
    "AbortError",
    "AbortError",
  ]);
  expect(feedback.error).not.toHaveBeenCalled();
  expect(
    fetcher.mock.calls.filter((call) => call[1]?.method === "POST"),
  ).toHaveLength(1);
});

test("a timed out completion releases its queue slot and later writes can finish", async () => {
  const snapshot = savedSnapshot();
  const controllers: AbortController[] = [];
  const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
    const controller = new AbortController();
    controllers.push(controller);
    return controller.signal;
  });
  let writes = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method !== "POST") return Response.json(snapshot);
      if (++writes === 1)
        return new Promise<Response>((_resolve, reject) =>
          options.signal.addEventListener(
            "abort",
            () => reject(options.signal.reason),
            { once: true },
          ),
        );
      return Response.json({
        ...snapshot,
        revision: 1,
        completedPaths: ["file.ts"],
      });
    }),
  );
  try {
    let current!: ReturnType<typeof useLivePreview>;
    const Observe = () => {
      const value = useLivePreview();
      useEffect(() => {
        current = value;
      }, [value]);
      return null;
    };
    render(
      <LivePreviewProvider>
        <Observe />
      </LivePreviewProvider>,
    );
    await act(async () => {});
    const first = current
      .changeReview({ action: "complete", path: "file.ts", complete: true })
      .catch((error) => error);
    controllers.at(-1)!.abort(new DOMException("Timed out", "TimeoutError"));
    expect((await first).name).toBe("TimeoutError");
    await act(async () => {
      await current.changeReview({
        action: "complete",
        path: "file.ts",
        complete: true,
      });
    });
    expect(current.preview!.completedPaths).toEqual(["file.ts"]);
    expect(feedback.error).toHaveBeenCalledExactlyOnceWith(
      "Local save timed out. Retry when ready.",
    );
    expect(timeout).toHaveBeenCalledWith(15000);
  } finally {
    timeout.mockRestore();
  }
});

test("re-sync cancels queued writes for the previous snapshot version", async () => {
  const snapshot = savedSnapshot();
  let polls = 0;
  const fetcher = vi.fn(async (_url, options) => {
    if (options?.method === "POST")
      return new Promise<Response>((_resolve, reject) =>
        options.signal.addEventListener(
          "abort",
          () => reject(options.signal.reason),
          { once: true },
        ),
      );
    return Response.json(
      polls++ === 0
        ? snapshot
        : { ...snapshot, hash: "b".repeat(64), round: 2, revision: 1 },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  let current!: ReturnType<typeof useLivePreview>;
  const Observe = () => {
    const value = useLivePreview();
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  };
  render(
    <LivePreviewProvider>
      <Observe />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  const pending = [
    current.changeReview({
      action: "complete",
      path: "file.ts",
      complete: true,
    }),
    current.changeReview({ action: "select", path: "file.ts" }),
  ].map((promise) => promise.catch((error) => error));
  let settled: unknown;
  void Promise.all(pending).then((results) => {
    settled = results;
  });
  await act(async () => {
    await current.refresh();
  });
  expect(current.preview!.round).toBe(2);
  expect(
    fetcher.mock.calls.filter((call) => call[1]?.method === "POST"),
  ).toHaveLength(1);
  expect(settled).toEqual([
    expect.objectContaining({ name: "AbortError" }),
    expect.objectContaining({ name: "AbortError" }),
  ]);
});

test("queued writes carry the identity shown when enqueued even before a re-sync is polled", async () => {
  const snapshot = savedSnapshot();
  let release!: () => void;
  const writes: unknown[] = [];
  const fetcher = vi.fn(async (_url, options) => {
    if (options?.method !== "POST") return Response.json(snapshot);
    writes.push(JSON.parse(options.body));
    if (writes.length === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return Response.json({ ...snapshot, revision: writes.length });
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <LivePreviewProvider>
      <Consumer />
    </LivePreviewProvider>,
  );
  await screen.findByText("file.ts");
  fireEvent.click(screen.getByText("Change"));
  fireEvent.click(screen.getByText("Change"));
  await act(async () => {
    release();
  });
  await waitFor(() => expect(writes).toHaveLength(2));
  for (const write of writes)
    expect(write).toMatchObject({
      expectedHash: snapshot.hash,
      expectedRound: snapshot.round,
    });
});

test("background changes to the workspace selection cannot navigate a pinned reader or replace its unsaved draft", async () => {
  vi.useFakeTimers();
  const first = savedSnapshot();
  const second = {
    ...first,
    id: "00000000-0000-4000-8000-000000000002",
    files: [{ ...first.files[0]!, path: "other.ts" }],
  };
  let shared = first;
  const fetcher = vi.fn(async (url: string) =>
    Response.json(url.includes(`id=${first.id}`) ? first : shared),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <LivePreviewProvider>
      <Consumer />
      <textarea aria-label="Draft" defaultValue="unfinished" />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  const draft = screen.getByLabelText("Draft") as HTMLTextAreaElement;
  draft.focus();
  shared = second;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(screen.getByText("file.ts")).toBeTruthy();
  expect(screen.queryByText("other.ts")).toBeNull();
  expect(document.activeElement).toBe(draft);
  expect(draft.value).toBe("unfinished");
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe(`/api/preview?id=${first.id}`);
});

test("review-specific links open the intended snapshot and local selection survives another tab's writes", async () => {
  const snapshot = savedSnapshot();
  snapshot.files.push({ ...snapshot.files[0]!, path: "second.ts" });
  window.history.replaceState(
    null,
    "",
    `/?review=${snapshot.id}&file=second.ts`,
  );
  const fetcher = vi.fn(async (_url, options) =>
    Response.json(
      options?.method === "POST"
        ? { ...snapshot, revision: 1, selectedPath: "second.ts" }
        : snapshot,
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  let current!: ReturnType<typeof useLivePreview>;
  const Observe = () => {
    const value = useLivePreview();
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  };
  render(
    <LivePreviewProvider>
      <Observe />
    </LivePreviewProvider>,
  );
  await act(async () => {});
  expect(fetcher.mock.calls[0]?.[0]).toBe(`/api/preview?id=${snapshot.id}`);
  expect(current.preview?.selectedPath).toBe("second.ts");
  expect(new URL(window.location.href).searchParams.has("file")).toBe(false);
  await act(async () => {
    await current.changeReview({ action: "select", path: "file.ts" });
  });
  await act(async () => {
    await current.refresh();
  });
  expect(current.preview?.selectedPath).toBe("file.ts");
});
