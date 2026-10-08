// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { StrictMode } from "react";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { WebSocket as NodeWebSocket } from "ws";
import { createPresenceServer } from "../../../../../../apps/connection-server/src/server";
import { usePresence } from "../hooks/use-presence";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a mounted dashboard hook receives inspect delivery through real HTTP and WebSockets", async () => {
  const tickets = new Set<string>();
  const { server } = createPresenceServer(
    {
      websiteOrigin: "http://localhost:3000",
      internalSecret: "fixture-secret",
    },
    {
      authenticateCLI: async () => ({
        userId: "owner",
        sessionId: "cli",
        deviceId: "device",
      }),
      consumeBrowserTicket: async (ticket) =>
        tickets.delete(ticket)
          ? { userId: "owner", sessionId: "browser" }
          : null,
      validBrowserSession: async () => true,
    },
  );
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TCP required");
  const origin = `http://127.0.0.1:${address.port}`;
  const socketURL = origin.replace("http:", "ws:") + "/connection";
  const sockets: NodeWebSocket[] = [];
  const realFetch = globalThis.fetch;
  let ticketIndex = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const ticket = `ticket-${ticketIndex++}`;
      tickets.add(ticket);
      return new Response(
        JSON.stringify({
          ticket,
          expiresAt: new Date(Date.now() + 30000).toISOString(),
          connectionUrl: socketURL,
        }),
      );
    }),
  );
  class BrowserSocket {
    onopen?: () => void;
    onclose?: () => void;
    onerror?: () => void;
    onmessage?: (event: { data: string }) => void;
    socket: NodeWebSocket;
    constructor(url: string) {
      this.socket = new NodeWebSocket(url, { origin: "http://localhost:3000" });
      sockets.push(this.socket);
      this.socket.on("open", () => this.onopen?.());
      this.socket.on("message", (data) =>
        this.onmessage?.({ data: data.toString() }),
      );
      this.socket.on("close", () => this.onclose?.());
      this.socket.on("error", () => this.onerror?.());
    }
    close = () => this.socket.close();
  }
  vi.stubGlobal("WebSocket", BrowserSocket);
  const onPreview = vi.fn();
  try {
    const cli = new NodeWebSocket(socketURL + "?protocolVersion=1", {
      headers: { Authorization: "Bearer valid" },
    });
    sockets.push(cli);
    await once(cli, "open");
    const hook = renderHook(
      () => usePresence({ onPreview, onDisconnect: vi.fn() }),
      { wrapper: StrictMode },
    );
    await waitFor(() =>
      expect(hook.result.current.devices.map((device) => device.id)).toEqual([
        "device",
      ]),
    );
    const after = "hello\n";
    const response = await realFetch(origin + "/preview", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        protocolVersion: 1,
        source: {
          kind: "working-tree",
          base: "a".repeat(40),
          head: null,
          firstParent: false,
        },
        excluded: [],
        files: [
          {
            path: "file.ts",
            oldPath: null,
            status: "A",
            before: null,
            after,
            beforeHash: null,
            afterHash: createHash("sha256").update(after).digest("hex"),
            binary: false,
            added: 1,
            deleted: 0,
            diff: "--- /dev/null\n+++ b/file.ts\n@@ -0,0 +1,1 @@\n+hello\n",
          },
        ],
      }),
    });
    expect(
      response.status,
      "An open dashboard must not receive the 'Open your Senslop dashboard' error",
    ).toBe(200);
    await waitFor(() =>
      expect(onPreview.mock.calls.map(([event]) => event.type)).toEqual([
        "preview.start",
        "preview.file",
        "preview.complete",
      ]),
    );
    act(() => hook.unmount());
  } finally {
    cleanup();
    sockets.forEach((socket) => socket.terminate());
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
