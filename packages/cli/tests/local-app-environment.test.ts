import { EventEmitter } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ForkOptions } from "node:child_process";
import { afterEach, expect, test, vi } from "vitest";
import { startLocalApp } from "../src/features/workspace/local-app";

const state = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: state.fork }));
vi.mock("@senslop/review-core/git", () => ({
  resolveRepository: async () => "/fixture-repository",
}));
vi.mock("../src/features/workspace/local-jobs", () => ({
  availablePort: async () => 19876,
}));
vi.mock("../src/features/workspace/workspace-session", () => ({
  publishWorkspaceSession: async () => {},
  removeWorkspaceSession: async () => {},
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

test("the app launcher forwards Claude account, proxy and certificate settings without billing credentials or Node hooks", async () => {
  const forwarded = [
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TERM",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "APPDATA",
    "LOCALAPPDATA",
    "COMSPEC",
    "SYSTEMROOT",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "PATHEXT",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "CLAUDE_CONFIG_DIR",
  ];
  const excluded = [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_USE_BEDROCK",
    "AWS_ACCESS_KEY_ID",
    "GOOGLE_API_KEY",
    "OPENAI_API_KEY",
    "NODE_OPTIONS",
    "NODE_PATH",
  ];
  const directory = await mkdtemp(join(tmpdir(), "senslop-launch-env-"));
  const entry = join(directory, "server.mjs");
  await writeFile(entry, "");
  for (const key of [...forwarded, ...excluded])
    vi.stubEnv(key, `fixture-${key}`);
  vi.stubEnv("TMPDIR", directory);
  let options: ForkOptions | undefined;
  const child = new EventEmitter();
  state.fork.mockImplementation((_entry, _args, captured: ForkOptions) => {
    options = captured;
    return Object.assign(child, {
      kill: vi.fn(() => {
        queueMicrotask(() => child.emit("exit", 0, null));
        return true;
      }),
    });
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(null, {
          headers: {
            "X-Senslop-Session": options?.env?.SENSLOP_LOCAL_TOKEN ?? "",
          },
        }),
    ),
  );
  let app: Awaited<ReturnType<typeof startLocalApp>> | undefined;
  try {
    app = await startLocalApp({
      repository: "/fixture-repository/apps/client",
      serverPath: entry,
      dataDirectory: directory,
      jobs: false,
    });
    expect(options?.env?.SENSLOP_LOCAL_DIRECTORY).toBe(
      "/fixture-repository/apps/client",
    );
    expect(options?.env?.SENSLOP_LOCAL_REPOSITORY).toBe("/fixture-repository");
    for (const key of forwarded)
      expect(options?.env?.[key], key).toBe(
        key === "TMPDIR" ? directory : `fixture-${key}`,
      );
    for (const key of excluded)
      expect(options?.env?.[key], key).toBeUndefined();
    expect(options?.execArgv).toEqual([
      "--import",
      expect.stringContaining("parent-monitor.mjs"),
    ]);
  } finally {
    await app?.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
