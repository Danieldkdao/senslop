import { afterEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalApp } from "../local-app.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

const fixture = async (code?: string) => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-local-test-"));
  directories.push(directory);
  // This fixture imitates the generated server's runtime environment contract.
  await writeFile(
    join(directory, "server.cjs"),
    code ??
      `
    const http = require('node:http');
    http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Senslop-Session', process.env.SENSLOP_LOCAL_TOKEN);
      res.end(JSON.stringify({ token: process.env.SENSLOP_LOCAL_TOKEN, database: process.env.DATABASE_URL ?? null }));
    }).listen(Number(process.env.PORT), process.env.HOSTNAME);
  `,
  );
  return join(directory, "server.cjs");
};

test("a local app starts without cloud credentials, atomically receives snapshots and releases its port", async () => {
  const serverPath = await fixture();
  const app = await startLocalApp({ serverPath });
  try {
    const response = await fetch(new URL("/api/health", app.origin));
    expect(response.ok).toBe(true);
    expect(
      ((await response.json()) as { database: string | null }).database,
    ).toBeNull();
    const snapshot = {
      source: {
        kind: "working-tree",
        base: "a".repeat(40),
        head: null,
        firstParent: false,
      },
      files: [
        {
          path: "a.ts",
          oldPath: null,
          status: "A",
          before: null,
          after: "one\n",
          beforeHash: null,
          afterHash: "a".repeat(64),
          binary: false,
          added: 1,
          deleted: 0,
          diff: "patch",
        },
      ],
      excluded: [],
    };
    await app.setSnapshot(snapshot);
    const saved = JSON.parse(await readFile(app.snapshotPath, "utf8"));
    expect(saved.files[0].after).toBe("one\n");
    expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(saved.protocolVersion).toBe(1);
    expect(app.url).toContain("/api/session?token=");
  } finally {
    await app.stop();
  }
  await expect(fetch(app.origin)).rejects.toThrow();
  await expect(readFile(app.snapshotPath)).rejects.toThrow();
});

test("aborting the workspace shuts down its child and resolves the lifetime", async () => {
  const signal = new AbortController();
  const app = await startLocalApp({
    serverPath: await fixture(),
    signal: signal.signal,
  });
  signal.abort();
  await app.closed;
  await expect(fetch(app.origin)).rejects.toThrow();
});

test("an exited child fails startup promptly instead of leaving a connection loop running", async () => {
  await expect(
    startLocalApp({
      serverPath: await fixture("process.exit(7)"),
      startupTimeout: 2000,
    }),
  ).rejects.toThrow(/exited|start/i);
});

test("a missing bundled server explains that the CLI must be built", async () => {
  await expect(
    startLocalApp({ serverPath: "/missing/senslop/server.js" }),
  ).rejects.toThrow(/build|bundle/i);
});
