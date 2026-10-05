import { afterEach, expect, test, vi } from "vitest";
import { authenticateCLI } from "../src/auth";

const websiteOrigin = "http://localhost:3000";

afterEach(() => vi.restoreAllMocks());

test.each([401, 403])(
  "only an authoritative %i rejects the credential",
  async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status }),
    );
    await expect(
      authenticateCLI("test-token", websiteOrigin),
    ).resolves.toBeNull();
  },
);

test.each([429, 500, 503])(
  "an account-service %i remains retryable",
  async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status }),
    );
    await expect(
      authenticateCLI("test-token", websiteOrigin),
    ).rejects.toThrow();
  },
);

test("a network failure remains retryable", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("network unavailable"),
  );
  await expect(authenticateCLI("test-token", websiteOrigin)).rejects.toThrow(
    "network unavailable",
  );
});

test("a malformed account response cannot revoke a credential", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ user: null }),
  );
  await expect(authenticateCLI("test-token", websiteOrigin)).rejects.toThrow();
});

test("a validated account response supplies the scoped CLI identity", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({
      user: { id: "account", name: "Test User", email: "test@example.invalid" },
      deviceId: "cli-session",
      deviceName: "Test CLI",
      connectionUrl: "ws://localhost:4001/connection",
    }),
  );
  await expect(authenticateCLI("test-token", websiteOrigin)).resolves.toEqual({
    userId: "account",
    sessionId: "cli-session",
    deviceId: "cli-session",
    name: "Test CLI",
  });
  expect(request).toHaveBeenCalledWith(
    new URL("/api/cli/status", websiteOrigin),
    expect.objectContaining({
      headers: { Authorization: "Bearer test-token" },
      redirect: "error",
      signal: expect.any(AbortSignal),
    }),
  );
});
