import { afterEach, expect, test, vi } from "vitest";
import { fetchStatus } from "../fetch-status.js";

const credentials = {
  baseURL: "http://localhost:3000",
  token: "fixture-token",
};
afterEach(() => vi.unstubAllGlobals());

test("status sends the saved bearer credential and returns validated account data", async () => {
  const account = {
    user: { id: "user", name: "Tester", email: "test@example.com" },
    deviceId: "device",
    deviceName: "CLI",
    connectionUrl: "ws://localhost:3001/connection",
  };
  const fetch = vi.fn().mockResolvedValue(Response.json(account));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchStatus(credentials)).resolves.toEqual(account);
  const options = fetch.mock.calls[0][1] as RequestInit;
  expect(new Headers(options.headers).get("Authorization")).toBe(
    "Bearer fixture-token",
  );
  expect(options.redirect).toBe("error");
});

test.each([401, 503])("status returns null on HTTP %i", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ code: "FAILED" }, { status })),
  );
  await expect(fetchStatus(credentials)).resolves.toBeNull();
});

test("status returns null for invalid responses and network failures", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ unexpected: true }))
    .mockResolvedValueOnce(new Response("not json"))
    .mockRejectedValueOnce(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchStatus(credentials)).resolves.toBeNull();
  await expect(fetchStatus(credentials)).resolves.toBeNull();
  await expect(fetchStatus(credentials)).resolves.toBeNull();
});
