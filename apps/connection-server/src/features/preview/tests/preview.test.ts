import { afterEach, expect, test } from "vitest";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { WebSocket } from "ws";
import { createPresenceServer } from "../../../server";
import { collectSnapshot } from "../../../../../../packages/cli/src/features/git/snapshot";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
const fixture = async () => {
  let revoked = false;
  let revokeAfterAuthentication = false;
  const tickets = new Map([
    ["a", "a"],
    ["b", "b"],
  ]);
  const { server } = createPresenceServer(
    { websiteOrigin: "http://localhost:3000", internalSecret: "secret" },
    {
      authenticateCLI: async (token) => {
        const identity =
          token === "valid" && !revoked
            ? { userId: "a", sessionId: "cli", deviceId: "device" }
            : null;
        if (revokeAfterAuthentication) revoked = true;
        return identity;
      },
      consumeBrowserTicket: async (ticket) => {
        const userId = tickets.get(ticket);
        tickets.delete(ticket);
        return userId ? { userId, sessionId: `browser-${userId}` } : null;
      },
      validBrowserSession: async () => true,
    },
  );
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TCP required");
  const origin = `http://127.0.0.1:${address.port}`;
  const sockets: WebSocket[] = [];
  cleanup.push(async () => {
    sockets.forEach((socket) => socket.terminate());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const connect = async (ticket?: string) => {
    const socket = new WebSocket(
      `${origin.replace("http:", "ws:")}/connection?protocolVersion=1${ticket ? `&ticket=${ticket}` : ""}`,
      ticket
        ? { origin: "http://localhost:3000" }
        : { headers: { Authorization: "Bearer valid" } },
    );
    sockets.push(socket);
    await once(socket, "open");
    return socket;
  };
  const send = (body: unknown, token = "valid") =>
    fetch(`${origin}/preview`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  return {
    connect,
    send,
    revokeOnUpload: () => {
      revokeAfterAuthentication = true;
    },
  };
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const payload = {
  protocolVersion: 1,
  source: {
    kind: "working-tree",
    base: "a".repeat(40),
    head: null,
    firstParent: false,
  },
  files: [
    {
      path: "hello.ts",
      oldPath: null,
      status: "A",
      before: null,
      after: "hello\n",
      beforeHash: null,
      afterHash: hash("hello\n"),
      binary: false,
      added: 1,
      deleted: 0,
      diff: "--- /dev/null\n+++ b/hello.ts\n@@ -0,0 +1,1 @@\n+hello\n",
    },
  ],
  excluded: [],
};

test("live preview streams ordered files only to its owner's browsers", async () => {
  const { connect, send } = await fixture();
  const other = await connect("b");
  const browser = await connect("a");
  await connect();
  const received: Array<{ type: string; file?: { after: string } }> = [];
  const leaked: unknown[] = [];
  other.on("message", (bytes) => {
    const event = JSON.parse(bytes.toString());
    if (event.type.startsWith("preview.")) leaked.push(event);
  });
  const complete = new Promise<void>((resolve) =>
    browser.on("message", (bytes) => {
      const event = JSON.parse(bytes.toString());
      if (event.type.startsWith("preview.")) received.push(event);
      if (event.type === "preview.complete") resolve();
    }),
  );
  const response = await send(payload);
  expect(response.status).toBe(200);
  await complete;
  expect(received.map((event) => event.type)).toEqual([
    "preview.start",
    "preview.file",
    "preview.complete",
  ]);
  expect(received[1]?.file?.after).toBe("hello\n");
  expect(leaked).toEqual([]);
});

test("preview requires authenticated CLI presence and an open browser", async () => {
  const { connect, send } = await fixture();
  expect((await send(payload, "invalid")).status).toBe(401);
  expect((await send(payload)).status).toBe(409);
  await connect();
  expect((await send(payload)).status).toBe(409);
  await connect("a");
  expect((await send(payload)).status).toBe(200);
});

test("a dashboard under another account cannot receive an inspection and returns account guidance", async () => {
  const { connect, send } = await fixture();
  await connect();
  const other = await connect("b");
  const received: unknown[] = [];
  other.on("message", (bytes) => {
    const event = JSON.parse(bytes.toString());
    if (event.type.startsWith("preview.")) received.push(event);
  });
  const response = await send(payload);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    message:
      "Open your Senslop dashboard signed in to the same account as the CLI before inspecting.",
  });
  expect(received).toEqual([]);
});

test("invalid hashes, line counts and duplicate file paths are rejected before delivery", async () => {
  const { connect, send } = await fixture();
  await connect();
  const browser = await connect("a");
  const received: unknown[] = [];
  browser.on("message", (bytes) => {
    const event = JSON.parse(bytes.toString());
    if (event.type.startsWith("preview.")) received.push(event);
  });
  expect(
    (
      await send({
        ...payload,
        files: [{ ...payload.files[0], afterHash: "0".repeat(64) }],
      })
    ).status,
  ).toBe(400);
  expect(
    (await send({ ...payload, files: [{ ...payload.files[0], added: 999 }] }))
      .status,
  ).toBe(400);
  expect(
    (await send({ ...payload, files: [...payload.files, ...payload.files] }))
      .status,
  ).toBe(400);
  expect(received).toEqual([]);
});

test("a CLI session revoked during upload cannot deliver source to a browser", async () => {
  const { connect, send, revokeOnUpload } = await fixture();
  await connect();
  const browser = await connect("a");
  const received: unknown[] = [];
  browser.on("message", (bytes) => {
    const event = JSON.parse(bytes.toString());
    if (event.type.startsWith("preview.")) received.push(event);
  });
  revokeOnUpload();
  expect((await send(payload)).status).toBe(401);
  expect(received).toEqual([]);
});

test("real Git snapshots relay exact BOM, CRLF, unusual paths, empty files, renames and binary metadata", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "senslop-preview-test-"));
  cleanup.push(() => rm(cwd, { recursive: true, force: true }));
  const execute = promisify(execFile);
  const git = (...args: string[]) => execute("git", args, { cwd });
  await git("init", "-b", "main");
  await git("config", "user.email", "fixture@example.test");
  await git("config", "user.name", "Fixture");
  await git("config", "commit.gpgsign", "false");
  const unusualPath = 'quoted "雪"\tfile.ts';
  await writeFile(join(cwd, unusualPath), "one\r\ntwo");
  await writeFile(join(cwd, "bom.ts"), "\uFEFFold\n");
  await writeFile(join(cwd, "rename.ts"), "unchanged\n");
  await writeFile(join(cwd, "deleted.ts"), "deleted\n");
  await git("add", ".");
  await git("commit", "-m", "base");
  await writeFile(join(cwd, unusualPath), "one\r\nthree\r\nfour");
  await writeFile(join(cwd, "bom.ts"), "\uFEFFnew\n");
  await git("mv", "rename.ts", "renamed.ts");
  await rm(join(cwd, "deleted.ts"));
  await writeFile(join(cwd, "empty.ts"), "");
  await writeFile(join(cwd, "binary.bin"), Buffer.from([0, 1, 255]));
  const snapshot = await collectSnapshot({
    cwd,
    source: { kind: "working-tree" },
  });
  const { connect, send } = await fixture();
  await connect();
  const browser = await connect("a");
  const received: unknown[] = [];
  const complete = new Promise<void>((resolve) =>
    browser.on("message", (bytes) => {
      const event = JSON.parse(bytes.toString());
      if (event.type === "preview.file") received.push(event.file);
      if (event.type === "preview.complete") resolve();
    }),
  );
  const response = await send({
    protocolVersion: 1,
    source: snapshot.source,
    files: snapshot.files,
    excluded: snapshot.excluded,
  });
  expect(response.status).toBe(200);
  await complete;
  expect(received).toEqual(snapshot.files);
  expect(snapshot.files.find((file) => file.path === "bom.ts")?.after).toBe(
    "\uFEFFnew\n",
  );
});
