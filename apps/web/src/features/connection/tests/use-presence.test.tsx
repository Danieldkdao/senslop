// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { usePresence } from "../hooks/use-presence";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("a rejected ticket exposes the API reason instead of claiming the account remains signed in", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "UNAUTHORIZED",
          message: "Sign in before connecting.",
          retryable: false,
        }),
        { status: 401 },
      ),
    ),
  );
  const hook = renderHook(() => usePresence());
  await waitFor(() =>
    expect(hook.result.current).toEqual({
      status: "retrying",
      devices: [],
      error: "Sign in before connecting.",
    }),
  );
});

test("late socket messages after unmount cannot deliver preview events", async () => {
  const sockets: BrowserSocket[] = [];
  class BrowserSocket {
    onmessage?: (event: { data: string }) => void;
    close = vi.fn();
    constructor() {
      sockets.push(this);
    }
  }
  vi.stubGlobal("WebSocket", BrowserSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ticket: "ticket",
          expiresAt: new Date(Date.now() + 30000).toISOString(),
          connectionUrl: "ws://localhost:3002/connection",
        }),
      ),
    ),
  );
  const onPreview = vi.fn();
  const hook = renderHook(() =>
    usePresence({ onPreview, onDisconnect: vi.fn() }),
  );
  await waitFor(() => expect(sockets).toHaveLength(1));
  hook.unmount();
  sockets[0]?.onmessage?.({
    data: JSON.stringify({
      type: "preview.complete",
      previewId: "12345678-1234-4234-9234-123456789abc",
    }),
  });
  expect(onPreview).not.toHaveBeenCalled();
});
