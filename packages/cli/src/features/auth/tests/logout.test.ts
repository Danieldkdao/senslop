import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readCredentials: vi.fn(),
  removeCredentials: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));

vi.mock("../credentials.js", () => ({
  readCredentials: mocks.readCredentials,
  removeCredentials: mocks.removeCredentials,
}));
vi.mock("@clack/prompts", () => ({
  log: { success: mocks.success, info: mocks.info },
}));

import { logout } from "../logout.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readCredentials.mockResolvedValue({
    baseURL: "http://localhost:3000",
    token: "fixture-token",
  });
});

afterEach(() => vi.restoreAllMocks());

test("logout removes credentials only after bearer authentication confirms revocation", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ success: true }))
    .mockResolvedValueOnce(
      Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
    );
  await logout();
  expect(request).toHaveBeenCalledTimes(2);
  expect(request).toHaveBeenNthCalledWith(
    1,
    new URL("http://localhost:3000/api/auth/sign-out"),
    expect.objectContaining({ method: "POST" }),
  );
  expect(request).toHaveBeenNthCalledWith(
    2,
    new URL("http://localhost:3000/api/cli/status"),
    expect.objectContaining({
      headers: expect.any(Headers),
      redirect: "error",
    }),
  );
  const headers = request.mock.calls[1][1]?.headers as Headers;
  expect(headers.get("Authorization")).toBe("Bearer fixture-token");
  expect(mocks.removeCredentials).toHaveBeenCalledOnce();
  expect(mocks.success).toHaveBeenCalledOnce();
});

test.each([200, 403, 503])(
  "logout preserves credentials when verification returns %i",
  async (status) => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(
        Response.json({ code: "UNAUTHORIZED" }, { status }),
      );
    await expect(logout()).rejects.toThrow("could not be confirmed");
    expect(mocks.removeCredentials).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  },
);

test("logout preserves credentials when the revocation check loses its connection", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({ success: true }))
    .mockRejectedValueOnce(new Error("network unavailable"));
  await expect(logout()).rejects.toThrow("could not be confirmed");
  expect(mocks.removeCredentials).not.toHaveBeenCalled();
});

test("logout preserves credentials when native sign-out fails", async () => {
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(Response.json({}, { status: 503 }));
  await expect(logout()).rejects.toThrow();
  expect(request).toHaveBeenCalledOnce();
  expect(mocks.removeCredentials).not.toHaveBeenCalled();
});

test("an already signed-out CLI does not contact the website", async () => {
  mocks.readCredentials.mockResolvedValue(null);
  const request = vi.spyOn(globalThis, "fetch");
  await logout();
  expect(request).not.toHaveBeenCalled();
  expect(mocks.removeCredentials).not.toHaveBeenCalled();
});
