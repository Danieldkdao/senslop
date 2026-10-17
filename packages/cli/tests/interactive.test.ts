import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  text: vi.fn(),
  request: vi.fn(),
  start: vi.fn(),
  collect: vi.fn(),
  install: vi.fn(),
  confirm: vi.fn(),
  multiselect: vi.fn(),
}));
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  homedir: () => "/fixture-home",
}));
vi.mock("../src/features/skills/install.js", () => ({
  installReviewSkill: mocks.install,
}));
vi.mock("@clack/prompts", () => ({
  select: mocks.select,
  text: mocks.text,
  confirm: mocks.confirm,
  multiselect: mocks.multiselect,
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

test.each(["project", "user"])(
  "skill installation routes agents and Claude using %s scope",
  async (scope) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.install.mockResolvedValue({
      installed: true,
      path: "/fixture/SKILL.md",
    });
    for (const [input, expected] of [
      ["agents", "agents"],
      ["claude", "claude"],
    ]) {
      await main([
        "skills",
        "install",
        "--scope",
        scope,
        "--json",
        ...(input ? ["--agent", input] : []),
      ]);
      expect(mocks.install).toHaveBeenLastCalledWith(
        scope === "user" ? "/fixture-home" : process.cwd(),
        expected,
        false,
      );
    }
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  },
);

test("skill installation rejects unsupported agents and scopes before writing", async () => {
  for (const args of [
    ["--agent", "unknown"],
    ["--agent", "all"],
    ["--agent", "codex"],
    ["--scope", "unknown"],
    ["--agent", "both"],
    ["--all", "--symlink", "--no-symlink"],
    ["--all", "--agent", "claude"],
    ["--agent", "agents", "--symlink"],
    ["--agent", "claude", "--no-symlink"],
  ])
    await expect(main(["skills", "install", ...args])).rejects.toMatchObject({
      code: "invalid_arguments",
      exitCode: 2,
    });
  expect(mocks.install).not.toHaveBeenCalled();
});

test.each([true, false])(
  "--all skips target selection, asks about sharing a file, and honors answer %s",
  async (answer) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.confirm.mockResolvedValueOnce(answer);
    await main(["skills", "install", "--all"]);
    expect(mocks.confirm).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ message: expect.stringContaining("symlink") }),
    );
    expect(mocks.multiselect).not.toHaveBeenCalled();
    expect(mocks.install).toHaveBeenCalledWith(process.cwd(), "both", answer);
  },
);

test("canceling the symlink question writes no skill files", async () => {
  mocks.confirm.mockResolvedValueOnce(Symbol("cancel"));
  await expect(main(["skills", "install", "--all"])).rejects.toMatchObject({
    code: "canceled",
  });
  expect(mocks.install).not.toHaveBeenCalled();
});

test.each(["--symlink", "--no-symlink"])(
  "machine installation of both targets accepts explicit %s without a prompt",
  async (flag) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await main([
      "skills",
      "install",
      "--all",
      flag,
      "--scope",
      "user",
      "--json",
    ]);
    expect(mocks.install).toHaveBeenCalledWith(
      "/fixture-home",
      "both",
      flag === "--symlink",
    );
    expect(mocks.confirm).not.toHaveBeenCalled();
  },
);

test("machine and piped installation of both targets requires an explicit symlink choice", async () => {
  await expect(
    main(["skills", "install", "--all", "--json"]),
  ).rejects.toMatchObject({ exitCode: 2 });
  Object.defineProperty(process.stdin, "isTTY", {
    value: false,
    configurable: true,
  });
  await expect(main(["skills", "install", "--all"])).rejects.toMatchObject({
    exitCode: 2,
  });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.install).not.toHaveBeenCalled();
});

test.each([
  [["claude"], "claude"],
  [["agents"], "agents"],
  [["agents", "claude"], "both"],
] as const)(
  "interactive target selection %j installs %s",
  async (selection, target) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.multiselect.mockResolvedValueOnce([...selection]);
    if (target === "both") mocks.confirm.mockResolvedValueOnce(false);
    await main(["skills"]);
    expect(mocks.install).toHaveBeenCalledWith(process.cwd(), target, false);
    expect(mocks.confirm).toHaveBeenCalledTimes(target === "both" ? 1 : 0);
  },
);

test.each([["skills"], ["skills", "install"]])(
  "%j without target flags allows an empty selection and defaults to both",
  async (...args) => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.multiselect.mockResolvedValueOnce([]);
    mocks.confirm.mockResolvedValueOnce(true);
    await main(args);
    expect(mocks.multiselect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        required: false,
        initialValues: [],
        options: expect.arrayContaining([
          expect.objectContaining({ value: "claude", label: "Claude" }),
          expect.objectContaining({
            value: "agents",
            label: "All other agents",
          }),
        ]),
      }),
    );
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.install).toHaveBeenCalledWith(process.cwd(), "both", true);
  },
);

test("canceling target selection writes nothing and skips the symlink question", async () => {
  mocks.multiselect.mockResolvedValueOnce(Symbol("cancel"));
  await expect(main(["skills"])).rejects.toMatchObject({ code: "canceled" });
  expect(mocks.install).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});

test("automated skills commands require explicit targets without opening a selector", async () => {
  await expect(main(["skills", "--json"])).rejects.toMatchObject({
    code: "invalid_arguments",
    exitCode: 2,
  });
  Object.defineProperty(process.stdin, "isTTY", {
    value: false,
    configurable: true,
  });
  await expect(main(["skills", "install"])).rejects.toMatchObject({
    code: "invalid_arguments",
    exitCode: 2,
  });
  expect(mocks.multiselect).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.install).not.toHaveBeenCalled();
});
