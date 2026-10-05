import { test, expect, vi, afterEach } from "vitest";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createPresenceServer } from "../src/server";

test("WebSocket rejects wrong origins and replayed tickets, scopes real presence events", async () => {
  const tickets = new Set(["one-use-ticket"]);
  const { server } = createPresenceServer(
    { websiteOrigin: "http://localhost:3000", internalSecret: "test-secret" },
    {
      authenticateCLI: async (token) =>
        token === "valid"
          ? { userId: "a", sessionId: "cli", deviceId: "cli", name: "test CLI" }
          : null,
      consumeBrowserTicket: async (ticket) =>
        tickets.delete(ticket) ? { userId: "a", sessionId: "browser" } : null,
      validBrowserSession: async () => true,
    },
  );
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP listener");
  const url = `ws://127.0.0.1:${address.port}/connection?protocolVersion=1`;
  const rejected = (origin: string) =>
    new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`${url}&ticket=one-use-ticket`, { origin });
      socket.on("unexpected-response", (_request, response) => {
        const status = response.statusCode!;
        response.resume();
        socket.terminate();
        resolve(status);
      });
      socket.on("error", () => {});
      socket.on("open", () => {
        socket.close();
        reject(new Error("Expected rejected connection"));
      });
    });
  // A bad origin must not consume the ticket.
  expect(await rejected("http://evil.example")).toBe(401);
  const browser = new WebSocket(`${url}&ticket=one-use-ticket`, {
    origin: "http://localhost:3000",
  });
  try {
    await once(browser, "open");
    expect(await rejected("http://localhost:3000")).toBe(401);
    const snapshot = new Promise<unknown>((resolve) =>
      browser.on("message", (bytes) => {
        const event = JSON.parse(bytes.toString());
        if (event.type === "presence.snapshot" && event.devices.length)
          resolve(event);
      }),
    );
    const cli = new WebSocket(url, {
      headers: { Authorization: "Bearer valid" },
    });
    await once(cli, "open");
    expect(
      (
        (await snapshot) as {
          devices: Array<{
            id: string;
          }>;
        }
      ).devices.map((d) => d.id),
    ).toEqual(["cli"]);
    const closed = once(cli, "close");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/internal/disconnect`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer test-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId: "cli" }),
      },
    );
    expect(response.status).toBe(204);
    const [code] = await closed;
    expect(code).toBe(4001);
  } finally {
    browser.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test.each([
  { description: "revocation", failure: null, code: 4001 },
  {
    description: "retryable account outage",
    failure: new Error("unavailable"),
    code: 1013,
  },
])(
  "heartbeat distinguishes $description",
  async ({ failure, code: expectedCode }) => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    let recheck = false;
    const { server } = createPresenceServer(
      { websiteOrigin: "http://localhost:3000", internalSecret: "test-secret" },
      {
        authenticateCLI: async () => {
          if (!recheck)
            return { userId: "a", sessionId: "cli", deviceId: "cli" };
          if (failure) throw failure;
          return null;
        },
        consumeBrowserTicket: async () => null,
        validBrowserSession: async () => false,
      },
    );
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected a TCP listener");
    const cli = new WebSocket(
      `ws://127.0.0.1:${address.port}/connection?protocolVersion=1`,
      { headers: { Authorization: "Bearer valid" } },
    );
    try {
      await once(cli, "open");
      recheck = true;
      const closed = once(cli, "close");
      await vi.advanceTimersByTimeAsync(15000);
      const [code] = await closed;
      expect(code).toBe(expectedCode);
    } finally {
      cli.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      vi.useRealTimers();
    }
  },
);

afterEach(() => vi.useRealTimers());

test("HTTP routes enforce authorization before bounded JSON validation", async () => {
  const { server } = createPresenceServer(
    { websiteOrigin: "http://localhost:3000", internalSecret: "test-secret" },
    {
      authenticateCLI: vi.fn().mockResolvedValue(null),
      consumeBrowserTicket: vi.fn().mockResolvedValue(null),
      validBrowserSession: vi.fn().mockResolvedValue(false),
    },
  );
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP listener");
  const baseURL = `http://127.0.0.1:${address.port}`;
  const disconnect = (body: string, authorized = true) =>
    fetch(`${baseURL}/internal/disconnect`, {
      method: "POST",
      headers: {
        Authorization: authorized ? "Bearer test-secret" : "Bearer invalid",
        "Content-Type": "application/json",
      },
      body,
    });

  try {
    expect(await (await fetch(`${baseURL}/health`)).text()).toBe("ok");
    expect((await fetch(`${baseURL}/missing`)).status).toBe(404);
    expect((await disconnect("x".repeat(2048), false)).status).toBe(401);
    expect((await disconnect("{")).status).toBe(400);
    expect((await disconnect(JSON.stringify({ sessionId: "" }))).status).toBe(
      400,
    );
    expect(
      (
        await disconnect(
          JSON.stringify({ sessionId: "cli", padding: "x".repeat(1024) }),
        )
      ).status,
    ).toBe(413);
    expect(
      (await disconnect(JSON.stringify({ sessionId: "cli" }))).status,
    ).toBe(204);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
