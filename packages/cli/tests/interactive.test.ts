import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  text: vi.fn(),
  request: vi.fn(),
  start: vi.fn(),
  collect: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@clack/prompts", () => ({
  select: mocks.select,
  text: mocks.text,
  confirm: mocks.confirm,
  isCancel: (value: unknown) => typeof value === "symbol",
  intro: vi.fn(),
  outro: vi.fn(),
  log: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/features/workspace/run-workspace.js", () => ({
  runWorkspace: mocks.start,
}));
vi.mock("../src/features/workspace/workspace-client.js", () => ({
  connectWorkspace: async () => ({
    request: mocks.request,
    info: () => ({ origin: "http://127.0.0.1:4317" }),
  }),
}));
vi.mock("../src/features/git/snapshot.js", () => ({
  collectSnapshot: mocks.collect,
}));
import { main } from "../src/index.js";
const stdin = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdout = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process.stdin, "isTTY", {
    value: true,
    configurable: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    value: true,
    configurable: true,
  });
});
afterEach(() => {
  if (stdin) Object.defineProperty(process.stdin, "isTTY", stdin);
  else Reflect.deleteProperty(process.stdin, "isTTY");
  if (stdout) Object.defineProperty(process.stdout, "isTTY", stdout);
  else Reflect.deleteProperty(process.stdout, "isTTY");
  process.exitCode = 0;
});

test("the interactive CLI attaches to the app and exits after a focused command", async () => {
  mocks.select.mockResolvedValueOnce("reviews list");
  mocks.request.mockResolvedValue({ history: [] });
  vi.spyOn(console, "log").mockImplementation(() => {});
  await main([]);
  expect(mocks.request).toHaveBeenCalledWith(
    expect.stringContaining("history=1"),
  );
  expect(mocks.start).not.toHaveBeenCalled();
});

test("app start owns the app, and its development flag never reaches ordinary review commands", async () => {
  await main(["app", "start", "--dev", "--no-open"]);
  expect(mocks.start).toHaveBeenCalledWith(
    expect.objectContaining({ development: true, openBrowser: false }),
  );
  await expect(main(["reviews", "create", "--dev"])).rejects.toThrow(/--dev/);
});

test("standalone JSON inspection stays prompt-free and never starts or attaches to an app", async () => {
  const snapshot = { files: [], eligibility: { eligible: true } };
  mocks.collect.mockResolvedValue(snapshot);
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  await main(["inspect", "--working-tree", "--json"]);
  expect(output).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify(snapshot, null, 2),
  );
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.start).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

test("machine-readable help uses the live command catalog without an app", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  await main(["help", "--json"]);
  const catalog = JSON.parse(output.mock.calls[0]![0]);
  expect(catalog.commands).toContainEqual(
    expect.objectContaining({ name: "reviews create" }),
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
