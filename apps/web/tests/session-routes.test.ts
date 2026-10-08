import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "../src/app/api/cli/status/route";
import { POST } from "../src/app/api/connection-ticket/route";

const state = vi.hoisted(() => ({
  currentUser: vi.fn(),
  issueTicket: vi.fn(),
}));
vi.mock("@/lib/auth/helpers", () => ({ getCurrentUser: state.currentUser }));
vi.mock("@/lib/auth/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("@/data/env/server", () => ({
  serverEnv: {
    BETTER_AUTH_URL: "http://localhost:3000",
    CONNECTION_URL: "ws://localhost:3002/connection",
  },
}));
vi.mock("@senslop/database", () => ({
  db: {},
  DeviceTable: {},
  issueTicket: state.issueTicket,
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.currentUser.mockResolvedValue({
    user: null,
    session: null,
    userId: null,
  });
});

test("CLI validation uses only its bearer credential despite browser cookies", async () => {
  const response = await GET(
    new Request("http://localhost:3000/api/cli/status", {
      headers: {
        authorization: "Bearer expired-token",
        cookie: "valid-browser-cookie",
      },
    }),
  );
  expect(response.status).toBe(401);
  const headers = state.currentUser.mock.calls[0][0] as Headers;
  expect(headers.get("authorization")).toBe("Bearer expired-token");
  expect(headers.has("cookie")).toBe(false);
});

test("browser tickets use the request's cookie headers", async () => {
  const request = new Request("http://localhost:3000/api/connection-ticket", {
    method: "POST",
    headers: { origin: "http://localhost:3000", cookie: "session-cookie" },
  });
  expect((await POST(request)).status).toBe(401);
  expect(state.currentUser).toHaveBeenCalledWith(request.headers);
  expect(state.issueTicket).not.toHaveBeenCalled();
});

test("existing unverified sessions cannot create browser tickets or CLI devices", async () => {
  state.currentUser.mockResolvedValue({
    userId: "user-1",
    user: { id: "user-1", emailVerified: false },
    session: { id: "session-1" },
  });
  const cli = await GET(
    new Request("http://localhost:3000/api/cli/status", {
      headers: { authorization: "Bearer token" },
    }),
  );
  const browser = await POST(
    new Request("http://localhost:3000/api/connection-ticket", {
      method: "POST",
      headers: { origin: "http://localhost:3000", cookie: "session-cookie" },
    }),
  );
  expect(cli.status).toBe(403);
  expect(browser.status).toBe(403);
  expect((await cli.json()).code).toBe("EMAIL_NOT_VERIFIED");
  expect(state.issueTicket).not.toHaveBeenCalled();
});

test("session service failures remain retryable service errors", async () => {
  state.currentUser.mockRejectedValue(new Error("service unavailable"));
  expect(
    (
      await GET(
        new Request("http://localhost:3000/api/cli/status", {
          headers: { authorization: "Bearer token" },
        }),
      )
    ).status,
  ).toBe(503);
});
