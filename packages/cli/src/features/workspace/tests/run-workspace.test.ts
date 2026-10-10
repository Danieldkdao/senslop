import { beforeEach, expect, test, vi } from "vitest";
import type { FrozenSnapshot } from "../../git/snapshot.js";

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  open: vi.fn(),
  select: vi.fn(),
  setSnapshot: vi.fn(),
  stop: vi.fn(),
  error: vi.fn(),
}));
vi.mock("../local-app.js", () => ({ startLocalApp: mocks.start }));
vi.mock("open", () => ({ default: mocks.open }));
vi.mock("@clack/prompts", () => ({
  isCancel: (value: unknown) => typeof value === "symbol",
  select: mocks.select,
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: mocks.error },
  spinner: () => ({ start: vi.fn(), stop: vi.fn(), error: vi.fn() }),
}));
import { runWorkspace } from "../run-workspace.js";

const snapshot = { files: [{ path: "sample.ts" }] } as FrozenSnapshot;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.open.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue({
    url: "http://127.0.0.1:4317/api/session?token=local",
    setSnapshot: mocks.setSnapshot,
    stop: mocks.stop,
    closed: new Promise(() => {}),
  });
});

test("connect opens the browser and publishes multiple selections from one terminal", async () => {
  mocks.select
    .mockResolvedValueOnce("inspect")
    .mockResolvedValueOnce("inspect")
    .mockResolvedValueOnce("stop");
  const inspect = vi.fn().mockResolvedValue(snapshot);
  await runWorkspace({ interactive: true, inspect });
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(inspect).toHaveBeenCalledTimes(2);
  expect(mocks.setSnapshot).toHaveBeenCalledTimes(2);
  expect(mocks.stop).toHaveBeenCalled();
});

test("inspection errors leave the local app running for another selection", async () => {
  mocks.select
    .mockResolvedValueOnce("inspect")
    .mockResolvedValueOnce("inspect")
    .mockResolvedValueOnce("stop");
  const inspect = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unknown Git revision"))
    .mockResolvedValueOnce(snapshot);
  await runWorkspace({ interactive: true, inspect });
  expect(mocks.error).toHaveBeenCalledWith("Unknown Git revision");
  expect(mocks.setSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot);
});

test("canceling the menu stops the app and removes process signal handlers", async () => {
  const signals = process.listenerCount("SIGINT");
  mocks.select.mockResolvedValueOnce(Symbol("cancel"));
  await runWorkspace({ interactive: true, snapshot, inspect: vi.fn() });
  expect(mocks.setSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot);
  expect(mocks.stop).toHaveBeenCalled();
  expect(process.listenerCount("SIGINT")).toBe(signals);
});

test("signal handlers are removed even when the child fails during shutdown", async () => {
  const interruptListeners = process.listenerCount("SIGINT");
  const terminateListeners = process.listenerCount("SIGTERM");
  mocks.select.mockResolvedValueOnce("stop");
  mocks.stop.mockRejectedValue(new Error("Child exited unexpectedly"));
  await expect(
    runWorkspace({ interactive: true, inspect: vi.fn() }),
  ).rejects.toThrow("Child exited unexpectedly");
  expect(process.listenerCount("SIGINT")).toBe(interruptListeners);
  expect(process.listenerCount("SIGTERM")).toBe(terminateListeners);
});
