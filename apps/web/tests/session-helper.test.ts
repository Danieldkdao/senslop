import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/helpers";

const state = vi.hoisted(() => ({ getSession: vi.fn(), headers: vi.fn() }));

vi.mock("next/headers", () => ({ headers: state.headers }));
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession: state.getSession } },
}));

beforeEach(() => vi.resetAllMocks());

test("explicit request headers are used for fresh session validation", async () => {
  const headers = new Headers({ authorization: "Bearer test-token" });
  const user = { id: "user-1", emailVerified: true };
  const session = { id: "session-1" };
  state.getSession.mockResolvedValue({ user, session });
  expect(await getCurrentUser(headers)).toEqual({
    userId: user.id,
    user,
    session,
  });
  expect(state.getSession).toHaveBeenCalledWith({
    headers,
    query: { disableCookieCache: true },
  });
  expect(state.headers).not.toHaveBeenCalled();
});

test("server components use their current request headers", async () => {
  const headers = new Headers({ cookie: "test-cookie" });
  state.headers.mockResolvedValue(headers);
  state.getSession.mockResolvedValue(null);
  expect(await getCurrentUser()).toEqual({
    userId: null,
    user: null,
    session: null,
  });
  expect(state.getSession).toHaveBeenCalledWith({
    headers,
    query: { disableCookieCache: true },
  });
});

test("service failures remain distinguishable from a signed-out user", async () => {
  state.getSession.mockRejectedValue(new Error("service unavailable"));
  await expect(getCurrentUser(new Headers())).rejects.toThrow(
    "service unavailable",
  );
});
