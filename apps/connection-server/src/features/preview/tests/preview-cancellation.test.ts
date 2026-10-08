import { EventEmitter } from "node:events";
import type { Express, Request, Response, NextFunction } from "express";
import { expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { createHash } from "node:crypto";
import { PresenceRegistry } from "../../../presence";
import { mountPreviewRoutes } from "../routes";

type Handler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<void>;

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const fixture = () => {
  let handlers: Handler[] = [];
  const app = {
    post: (_path: string, ...mounted: Handler[]) => {
      handlers = mounted;
    },
  };
  const registry = new PresenceRegistry();
  const identity = { userId: "user", sessionId: "cli", deviceId: "device" };
  const authenticateCLI = vi.fn(async () => identity);
  const validBrowserSession = vi.fn(async () => true);
  const events: string[] = [];
  const send = vi.fn((data: string, callback?: (error?: Error) => void) => {
    const event = JSON.parse(data);
    if (event.type.startsWith("preview.")) events.push(event.type);
    callback?.();
  });
  registry.add({ send: vi.fn(), close: vi.fn() }, identity);
  registry.add(
    {
      send,
      close: vi.fn(),
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
    } as unknown as WebSocket,
    { userId: "user", sessionId: "browser" },
  );
  mountPreviewRoutes(app as unknown as Express, registry, {
    authenticateCLI,
    validBrowserSession,
    consumeBrowserTicket: async () => null,
  });
  const request = {
    get: (name: string) =>
      name === "authorization" ? "Bearer valid" : undefined,
    body: {
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
          afterHash: createHash("sha256").update("hello\n").digest("hex"),
          binary: false,
          added: 1,
          deleted: 0,
          diff: "--- /dev/null\n+++ b/hello.ts\n@@ -0,0 +1,1 @@\n+hello\n",
        },
      ],
      excluded: [],
    },
  } as unknown as Request;
  const response = () => {
    const value = Object.assign(new EventEmitter(), {
      locals: {},
      destroyed: false,
      status: vi.fn(),
      json: vi.fn(),
    });
    value.status.mockReturnValue(value);
    value.json.mockImplementation(() => {
      value.emit("close");
      return value;
    });
    return value;
  };
  const authorize = (value: ReturnType<typeof response>) =>
    handlers[0]!(request, value as unknown as Response, vi.fn());
  const deliver = (value: ReturnType<typeof response>) =>
    handlers[2]!(request, value as unknown as Response, vi.fn());
  const disconnect = (value: ReturnType<typeof response>) => {
    value.destroyed = true;
    value.emit("close");
  };
  return {
    authenticateCLI,
    validBrowserSession,
    events,
    send,
    response,
    authorize,
    deliver,
    disconnect,
  };
};

for (const stage of ["authentication", "browser validation"] as const) {
  test(`a disconnected upload awaiting ${stage} retains its lock and never starts a preview`, async () => {
    const setup = fixture();
    const old = setup.response();
    await setup.authorize(old);
    const gate = deferred();
    const entered = deferred();
    if (stage === "authentication")
      setup.authenticateCLI.mockImplementationOnce(async () => {
        entered.resolve();
        await gate.promise;
        return { userId: "user", sessionId: "cli", deviceId: "device" };
      });
    else
      setup.validBrowserSession.mockImplementationOnce(async () => {
        entered.resolve();
        await gate.promise;
        return true;
      });
    const pending = setup.deliver(old);
    await entered.promise;
    setup.disconnect(old);
    const retry = setup.response();
    await setup.authorize(retry);
    const retryStatus = retry.status.mock.calls[0]?.[0];
    gate.resolve();
    await pending;
    expect(retryStatus).toBe(409);
    expect(setup.events).toEqual([]);
    const successful = setup.response();
    await setup.authorize(successful);
    await setup.deliver(successful);
    expect(setup.events).toEqual([
      "preview.start",
      "preview.file",
      "preview.complete",
    ]);
  });
}

test("a disconnected delivery holds its lock until the final failure event settles", async () => {
  const setup = fixture();
  const old = setup.response();
  await setup.authorize(old);
  const entered = deferred();
  let finishStart!: () => void;
  let finishFailure!: () => void;
  setup.send.mockImplementationOnce((data, callback) => {
    setup.events.push(JSON.parse(data).type);
    finishStart = () => callback?.();
    entered.resolve();
  });
  const pending = setup.deliver(old);
  await entered.promise;
  setup.disconnect(old);
  const failureStarted = deferred();
  setup.send.mockImplementationOnce((data, callback) => {
    setup.events.push(JSON.parse(data).type);
    finishFailure = () => callback?.();
    failureStarted.resolve();
  });
  finishStart();
  await failureStarted.promise;
  const retry = setup.response();
  await setup.authorize(retry);
  const retryStatus = retry.status.mock.calls[0]?.[0];
  finishFailure();
  await pending;
  expect(retryStatus).toBe(409);
  expect(setup.events).toEqual(["preview.start", "preview.failed"]);
  const successful = setup.response();
  await setup.authorize(successful);
  await setup.deliver(successful);
  expect(setup.events.slice(2)).toEqual([
    "preview.start",
    "preview.file",
    "preview.complete",
  ]);
});

test.each(["completed", "closed during body parsing"] as const)(
  "late cleanup from an upload that %s cannot release a newer upload's lock",
  async (stage) => {
    const setup = fixture();
    const old = setup.response();
    await setup.authorize(old);
    old.json.mockReturnValue(old);
    if (stage === "completed") await setup.deliver(old);
    else setup.disconnect(old);
    const active = setup.response();
    await setup.authorize(active);
    if (stage === "completed") old.emit("close");
    else await setup.deliver(old);
    const retry = setup.response();
    await setup.authorize(retry);
    expect(retry.status).toHaveBeenCalledWith(409);
    await setup.deliver(active);
  },
);
