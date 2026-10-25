import { afterEach, expect, test } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join } from "node:path";
import { startLocalJobs, workspacePort } from "../local-jobs";
import { workspaceStateDirectory } from "../runtime-paths";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
test("local engine uses persistent per-repository state, loopback and shuts down with its owner", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "senslop-jobs-"));
  directories.push(dataDirectory);
  const savedPort = await workspacePort(dataDirectory, "/repo");
  expect(await workspacePort(dataDirectory, "/repo")).toBe(savedPort);
  const engine = join(dataDirectory, "engine.mjs");
  await writeFile(
    engine,
    `import { createServer } from 'node:http'; const args = process.argv.slice(2); createServer((request,response) => { response.end(JSON.stringify({ args, hasKey: !!process.env.INNGEST_EVENT_KEY })); }).listen(Number(args[args.indexOf('--port') + 1]), '127.0.0.1');`,
  );
  const jobs = await startLocalJobs({
    dataDirectory,
    repository: "/repo",
    sdkUrl: "http://127.0.0.1:3000/api/inngest?token=test",
    enginePath: engine,
  });
  await expect(workspacePort(dataDirectory, "/repo")).rejects.toThrow(
    /already running/,
  );
  const firstKey = jobs.env.INNGEST_EVENT_KEY;
  const workerToken = jobs.env.SENSLOP_LOCAL_WORKER_TOKEN;
  const data = (await (await fetch(jobs.env.INNGEST_BASE_URL)).json()) as {
    args: string[];
    hasKey: boolean;
  };
  expect(data.args).toContain("start");
  expect(data.args).toContain("--sqlite-dir");
  expect(data.args).toContain("127.0.0.1");
  expect(data.hasKey).toBe(true);
  expect(
    new URL(data.args[data.args.indexOf("--sdk-url") + 1]!).searchParams.get(
      "token",
    ),
  ).toBe(workerToken);
  await jobs.stop();
  await expect(fetch(jobs.env.INNGEST_BASE_URL)).rejects.toThrow();
  const restarted = await startLocalJobs({
    dataDirectory,
    repository: "/repo",
    sdkUrl: "http://127.0.0.1:3001/api/inngest",
    enginePath: engine,
  });
  expect(restarted.env.INNGEST_EVENT_KEY).toBe(firstKey);
  expect(restarted.env.SENSLOP_LOCAL_WORKER_TOKEN).toBe(workerToken);
  await restarted.stop();
});

test("an unowned workspace replaces an occupied saved port and persists its replacement", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "senslop-ports-"));
  directories.push(dataDirectory);
  const port = await workspacePort(dataDirectory, "/repo");
  const server = createServer();
  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve),
  );
  try {
    const replacement = await workspacePort(dataDirectory, "/repo");
    expect(replacement).not.toBe(port);
    expect(await workspacePort(dataDirectory, "/repo")).toBe(replacement);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("malformed saved ports are recoverable without claiming an unrelated owner", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "senslop-invalid-port-"));
  directories.push(dataDirectory);
  await workspacePort(dataDirectory, "/repo");
  await writeFile(
    join(workspaceStateDirectory(dataDirectory, "/repo"), "worker-port.json"),
    "invalid",
  );
  expect(await workspacePort(dataDirectory, "/repo")).toBeGreaterThan(0);
});
