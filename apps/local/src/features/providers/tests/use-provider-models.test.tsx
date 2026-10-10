// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useProviderModels } from "../hooks/use-provider-models";

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});
const setup = () => {
  const client = new QueryClient();
  clients.push(client);
  return renderHook(() => useProviderModels(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children),
  });
};
const connection = (id: string, provider: string, configured = true) => ({
  id,
  provider,
  configured,
  name: provider,
  baseURL: "http://localhost:1234/v1",
  model: "",
  contextWindow: null,
  credentialError: null,
});
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";

test("keyless local connections load and one failed provider does not block another", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (url === "/api/providers")
        return Response.json({
          connections: [
            connection(firstId, "llama-cpp", false),
            connection(secondId, "chatgpt"),
          ],
          defaultId: null,
          cleanupPending: false,
        });
      if (String(url).includes(firstId))
        return Response.json({
          models: [{ id: "local-model", name: "Local Model", available: true }],
          source: "live",
          message: null,
          manualAllowed: true,
        });
      return Response.json(
        { message: "Rejected credentials" },
        { status: 422 },
      );
    }),
  );
  const { result } = setup();
  await waitFor(() =>
    expect(result.current.entries[0]?.catalog?.models).toHaveLength(1),
  );
  await waitFor(() =>
    expect(result.current.entries[1]?.error?.message).toBe(
      "Rejected credentials",
    ),
  );
});

test("refresh refetches catalogs even if a replaced key does not change public settings", async () => {
  let model = "before";
  let catalogRequests = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      if (url === "/api/providers")
        return Response.json({
          connections: [connection(firstId, "chatgpt")],
          defaultId: null,
          cleanupPending: false,
        });
      catalogRequests++;
      return Response.json({
        models: [{ id: model, name: model, available: true }],
        source: "live",
        message: null,
        manualAllowed: false,
      });
    }),
  );
  const { result } = setup();
  await waitFor(() =>
    expect(result.current.entries[0]?.catalog?.models[0].id).toBe("before"),
  );
  model = "after";
  await act(() => result.current.refresh());
  await waitFor(() =>
    expect(result.current.entries[0]?.catalog?.models[0].id).toBe("after"),
  );
  expect(catalogRequests).toBe(2);
});
