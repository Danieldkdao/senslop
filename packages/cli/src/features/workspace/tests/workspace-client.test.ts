import { afterEach, expect, test } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import {
  publishWorkspaceSession,
  removeWorkspaceSession,
  workspaceSessionPath,
} from "../workspace-session.js";
import { connectWorkspace } from "../workspace-client.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

const fixture = async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-client-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const repository = join(directory, "repo");
  await mkdir(repository);
  await simpleGit(repository).init();
  const root = await simpleGit(repository).revparse(["--show-toplevel"]);
  const token = "a".repeat(64);
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(request.url!);
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader("X-Senslop-Session", token);
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  cleanup.push(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  const address = server.address() as { port: number };
  const session = {
    version: 1 as const,
    repository: root.trim(),
    origin: `http://127.0.0.1:${address.port}`,
    token,
    pid: process.pid,
  };
  await publishWorkspaceSession(directory, session);
  return { directory, repository, session, requests };
};

test("another terminal discovers its repository session and uses authenticated requests", async () => {
  const { directory, repository, session, requests } = await fixture();
  const client = await connectWorkspace(repository, directory);
  expect(await client.request("/api/workspace")).toEqual({ ok: true });
  expect(requests).toEqual(["/api/health", "/api/workspace"]);
  expect(client.info()).toEqual({
    repository: session.repository,
    origin: session.origin,
    pid: process.pid,
  });
  const path = workspaceSessionPath(directory, session.repository);
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(session);
  if (process.platform !== "win32")
    expect((await stat(path)).mode & 0o777).toBe(0o600);
});

test("stopping an old owner cannot remove a replacement session", async () => {
  const { directory, session } = await fixture();
  await removeWorkspaceSession(directory, {
    ...session,
    token: "b".repeat(64),
  });
  expect(
    await readFile(workspaceSessionPath(directory, session.repository), "utf8"),
  ).toContain(session.token);
  await removeWorkspaceSession(directory, session);
  await expect(connectWorkspace(session.repository, directory)).rejects.toThrow(
    /app start/,
  );
});

test("tampered discovery files cannot send credentials to remote origins or another repository", async () => {
  const { directory, repository, session } = await fixture();
  const path = workspaceSessionPath(directory, session.repository);
  for (const patch of [
    { origin: "https://example.com" },
    { origin: `${session.origin}/redirect` },
    { repository: "/another/repo" },
  ]) {
    await writeFile(path, JSON.stringify({ ...session, ...patch }));
    await expect(connectWorkspace(repository, directory)).rejects.toThrow(
      /app start/,
    );
  }
});

test("a stale capability fails discovery instead of attaching to an unrelated process", async () => {
  const { directory, repository, session } = await fixture();
  await writeFile(
    workspaceSessionPath(directory, session.repository),
    JSON.stringify({ ...session, token: "b".repeat(64) }),
  );
  await expect(connectWorkspace(repository, directory)).rejects.toThrow(
    /app start/,
  );
});
