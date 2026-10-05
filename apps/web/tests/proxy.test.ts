import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../src/proxy";

const state = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: state.currentUser }));

beforeEach(() => {
  vi.resetAllMocks();
  state.currentUser.mockResolvedValue({
    user: null,
    session: null,
    userId: null,
  });
});

const signedIn = (emailVerified = true) => {
  state.currentUser.mockResolvedValue({
    userId: "user-1",
    user: { id: "user-1", email: "dev@example.com", emailVerified },
    session: { id: "session-1" },
  });
};

test.each([
  "/",
  "/api/auth/get-session",
  "/api/cli/status",
  "/_next/static/example.js",
  "/favicon.ico",
])("%s bypasses page routing", async (path) => {
  expect(
    unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
  ).toBe(false);
  expect(
    (await proxy(new NextRequest(`http://localhost:3000${path}`))).headers.get(
      "x-middleware-next",
    ),
  ).toBe("1");
  expect(state.currentUser).not.toHaveBeenCalled();
});

test.each([
  "/dashboard",
  "/dashboard/reviews/123",
  "/device?user_code=ABCD-EFGH",
])("signed-out %s preserves the requested destination", async (path) => {
  expect(
    unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path }),
  ).toBe(true);
  const request = new NextRequest(`http://localhost:3000${path}`, {
    headers: { cookie: "better-auth.session_token=forged" },
  });
  const response = await proxy(request);
  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("redirect")).toBe(path);
  expect(state.currentUser).toHaveBeenCalledWith(request.headers);
});

test.each(["/login", "/signup"])(
  "signed-out users can open %s",
  async (path) => {
    expect(
      (
        await proxy(new NextRequest(`http://localhost:3000${path}`))
      ).headers.get("x-middleware-next"),
    ).toBe("1");
  },
);

test.each(["/dashboard", "/device?user_code=ABCD-EFGH"])(
  "verified users can open %s",
  async (path) => {
    signedIn();
    expect(
      (
        await proxy(new NextRequest(`http://localhost:3000${path}`))
      ).headers.get("x-middleware-next"),
    ).toBe("1");
  },
);

test.each([
  "/login",
  "/signup?redirect=https://outside.example",
  "/login?redirect=/signup",
])("verified users leave guest route %s for dashboard", async (path) => {
  signedIn();
  expect(
    (await proxy(new NextRequest(`http://localhost:3000${path}`))).headers.get(
      "location",
    ),
  ).toBe("http://localhost:3000/dashboard");
});

test("verified guest-page visitors retain the CLI continuation", async () => {
  signedIn();
  const response = await proxy(
    new NextRequest(
      "http://localhost:3000/login?redirect=%2Fdevice%3Fuser_code%3DABCD-EFGH",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/device?user_code=ABCD-EFGH",
  );
});

test("old unverified sessions are routed to verification without a loop", async () => {
  signedIn(false);
  const response = await proxy(
    new NextRequest("http://localhost:3000/device?user_code=ABCD-EFGH"),
  );
  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/login");
  expect(location.searchParams.get("verify")).toBe("1");
  expect(location.searchParams.get("email")).toBe("dev@example.com");
  expect(location.searchParams.get("redirect")).toBe(
    "/device?user_code=ABCD-EFGH",
  );
  expect(
    (await proxy(new NextRequest(location))).headers.get("x-middleware-next"),
  ).toBe("1");
});

test("session-service failure never grants access", async () => {
  state.currentUser.mockRejectedValue(new Error("database unavailable"));
  expect(
    (await proxy(new NextRequest("http://localhost:3000/dashboard"))).status,
  ).toBe(503);
});
