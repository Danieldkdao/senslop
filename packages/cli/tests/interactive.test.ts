import { afterEach, beforeEach, expect, test, vi } from "vitest";

const prompts = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: (value: unknown) => typeof value === "symbol",
  text: vi.fn(),
  select: vi.fn(),
  note: vi.fn(),
  log: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), error: vi.fn() })),
}));
const commands = vi.hoisted(() => ({
  login: vi.fn(),
  connect: vi.fn(),
  logout: vi.fn(),
  collectSnapshot: vi.fn(),
}));

vi.mock("@clack/prompts", () => prompts);
vi.mock("../src/features/auth/login.js", () => ({ login: commands.login }));
vi.mock("../src/features/auth/logout.js", () => ({ logout: commands.logout }));
vi.mock("../src/features/connection/connect.js", () => ({
  connect: commands.connect,
}));
vi.mock("../src/features/git/snapshot.js", () => ({
  collectSnapshot: commands.collectSnapshot,
}));

import { main } from "../src/index.js";

const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const snapshot = {
  source: { kind: "working-tree" },
  files: [],
  excluded: [],
  eligibility: { eligible: false, qualifyingFiles: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value: true,
  });
  process.exitCode = 0;
  commands.collectSnapshot.mockResolvedValue(snapshot);
});

afterEach(() => {
  if (stdinTTY) Object.defineProperty(process.stdin, "isTTY", stdinTTY);
  else Reflect.deleteProperty(process.stdin, "isTTY");
  if (stdoutTTY) Object.defineProperty(process.stdout, "isTTY", stdoutTTY);
  else Reflect.deleteProperty(process.stdout, "isTTY");
  process.exitCode = 0;
});

test("an interactive invocation offers a command menu", async () => {
  prompts.select.mockResolvedValueOnce("connect");
  await main([]);
  expect(prompts.select).toHaveBeenCalledWith(
    expect.objectContaining({ message: "What would you like to do?" }),
  );
  expect(commands.connect).toHaveBeenCalledOnce();
});

test("login asks for a website origin when not supplied", async () => {
  prompts.text.mockResolvedValueOnce("http://localhost:3000");
  await main(["login"]);
  expect(commands.login).toHaveBeenCalledWith("http://localhost:3000");
  expect(prompts.text).toHaveBeenCalledOnce();
});

test("inspection prompts for a source and preserves the ineligible exit code", async () => {
  prompts.select.mockResolvedValueOnce("working-tree");
  await main(["inspect"]);
  expect(commands.collectSnapshot).toHaveBeenCalledWith({
    cwd: process.cwd(),
    source: { kind: "working-tree" },
  });
  expect(process.exitCode).toBe(2);
});

test("cancelled prompts never start login or snapshot collection", async () => {
  prompts.text.mockResolvedValueOnce(Symbol("cancel"));
  await main(["login"]);
  expect(prompts.cancel).toHaveBeenCalledOnce();
  expect(commands.login).not.toHaveBeenCalled();
  expect(commands.collectSnapshot).not.toHaveBeenCalled();
});

test("JSON inspection never prompts or writes decorative output", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  await main(["inspect", "--working-tree", "--json"]);
  expect(output).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify(snapshot, null, 2),
  );
  expect(prompts.intro).not.toHaveBeenCalled();
  expect(prompts.spinner).not.toHaveBeenCalled();
  expect(prompts.select).not.toHaveBeenCalled();
});

test("JSON inspection requires an explicit source even in a terminal", async () => {
  await expect(main(["inspect", "--json"])).rejects.toThrow(
    "Choose exactly one",
  );
  expect(prompts.select).not.toHaveBeenCalled();
});

test("noninteractive login requires a URL and never waits for input", async () => {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: false,
  });
  await expect(main(["login"])).rejects.toThrow("--url");
  expect(prompts.text).not.toHaveBeenCalled();
});

test.each([
  ["commit", "HEAD", { kind: "commit", commit: "HEAD" }],
  ["range", "HEAD~1..HEAD", { kind: "range", base: "HEAD~1", head: "HEAD" }],
])("inspection prompts for the %s revision", async (kind, revision, source) => {
  prompts.select.mockResolvedValueOnce(kind);
  prompts.text.mockResolvedValueOnce(revision);
  await main(["inspect"]);
  expect(commands.collectSnapshot).toHaveBeenCalledWith({
    cwd: process.cwd(),
    source,
  });
});

test("a failed inspection clears its progress indicator", async () => {
  const progress = { start: vi.fn(), stop: vi.fn(), error: vi.fn() };
  prompts.spinner.mockReturnValueOnce(progress);
  commands.collectSnapshot.mockRejectedValueOnce(
    new Error("not a Git repository"),
  );
  await expect(main(["inspect", "--working-tree"])).rejects.toThrow(
    "not a Git repository",
  );
  expect(progress.error).toHaveBeenCalledExactlyOnceWith(
    "Snapshot could not be collected.",
  );
});
