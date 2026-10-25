import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  open: vi.fn(),
  stop: vi.fn(),
  select: vi.fn(),
  connect: vi.fn(),
}));
vi.mock("../local-app.js", () => ({ startLocalApp: mocks.start }));
vi.mock("../workspace-client.js", () => ({ connectWorkspace: mocks.connect }));
vi.mock("open", () => ({ default: mocks.open }));
vi.mock("@clack/prompts", () => ({
  select: mocks.select,
  log: { info: vi.fn(), warn: vi.fn() },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), error: vi.fn() }),
}));
import { runWorkspace } from "../run-workspace.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.open.mockResolvedValue(undefined);
  mocks.connect.mockRejectedValue(new Error("Unavailable"));
});

test("the dedicated app terminal waits for shutdown without presenting a command menu", async () => {
  let close!: () => void;
  const closed = new Promise<void>((resolve) => {
    close = resolve;
  });
  mocks.stop.mockImplementation(async () => {
    close();
  });
  mocks.start.mockImplementation(
    async ({ signal }: { signal: AbortSignal }) => {
      signal.addEventListener("abort", () => {
        void mocks.stop();
      });
      queueMicrotask(() => process.emit("SIGINT"));
      return {
        origin: "http://127.0.0.1:4317",
        url: "http://127.0.0.1:4317/api/session?token=private",
        stop: mocks.stop,
        closed,
      };
    },
  );
  const listeners = process.listenerCount("SIGINT");
  await runWorkspace({ repository: "/repo", openBrowser: false });
  expect(mocks.start).toHaveBeenCalledWith(
    expect.objectContaining({ repository: "/repo" }),
  );
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.stop).toHaveBeenCalled();
  expect(process.listenerCount("SIGINT")).toBe(listeners);
});

test("unexpected app exits propagate and remove lifecycle signal handlers", async () => {
  mocks.stop.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue({
    origin: "http://127.0.0.1:4317",
    url: "http://127.0.0.1:4317",
    stop: mocks.stop,
    closed: Promise.reject(new Error("Child exited")),
  });
  const listeners = process.listenerCount("SIGTERM");
  await expect(runWorkspace({ openBrowser: false })).rejects.toThrow(
    "Child exited",
  );
  expect(process.listenerCount("SIGTERM")).toBe(listeners);
});

test("starting again reuses the authenticated owner and exits without stopping it", async () => {
  const browserUrl = "http://127.0.0.1:4317/api/session?token=private";
  mocks.connect.mockResolvedValue({
    info: () => ({
      origin: "http://127.0.0.1:4317",
      repository: "/repo",
      pid: 123,
    }),
    browserUrl: () => browserUrl,
  });
  await runWorkspace({ repository: "/repo" });
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.open).toHaveBeenCalledWith(browserUrl);
  expect(mocks.stop).not.toHaveBeenCalled();
});
