import { afterEach, expect, test, vi } from "vitest";
import { GET, POST } from "../../../app/api/providers/subscriptions/route";
import { GET as callback } from "../../../app/auth/callback/route";
import { NextRequest } from "next/server";
import { proxy } from "../../../proxy";
import { ChatGptSignInError } from "../../../services/subscriptions/errors";

const state = vi.hoisted(() => ({
  allowed: true,
  start: vi.fn(),
  status: vi.fn(),
  cancel: vi.fn(),
  signOut: vi.fn(),
  completeChatGpt: vi.fn(),
}));
vi.mock("../../../services/subscriptions/server-subscriptions", () => ({
  getSubscriptionService: () => state,
}));
vi.mock("../../../data/env/server", () => ({
  serverEnv: {
    SENSLOP_LOCAL_ORIGIN: "http://127.0.0.1:9876",
    SENSLOP_LOCAL_TOKEN: "a".repeat(64),
  },
}));
afterEach(() => {
  state.allowed = true;
  vi.resetAllMocks();
});
const request = (body: unknown) =>
  new NextRequest("http://127.0.0.1:9876/api/providers/subscriptions", {
    method: "POST",
    headers: {
      host: "127.0.0.1:9876",
      "Content-Type": "application/json",
      ...(state.allowed ? { authorization: `Bearer ${"a".repeat(64)}` } : {}),
    },
    body: JSON.stringify(body),
  });

test("subscription actions require a valid local session and reject arbitrary provider names", async () => {
  state.allowed = false;
  expect(
    (await POST(request({ action: "sign-in", provider: "claude-code" })))
      .status,
  ).toBe(403);
  expect(
    (
      await GET(
        new Request("http://127.0.0.1:9876/api/providers/subscriptions"),
      )
    ).status,
  ).toBe(403);
  state.allowed = true;
  expect(
    (await POST(request({ action: "sign-in", provider: "custom" }))).status,
  ).toBe(400);
  expect(state.start).not.toHaveBeenCalled();
});

test("sign-in returns only flow state and callback exchanges credentials through the server", async () => {
  state.start.mockResolvedValue({
    id: "00000000-0000-4000-8000-000000000001",
    status: "pending",
  });
  const response = await POST(
    request({ action: "sign-in", provider: "chatgpt-subscription" }),
  );
  expect(response.status).toBe(200);
  expect(state.start).toHaveBeenCalledWith(
    "chatgpt-subscription",
    "http://127.0.0.1:9876",
  );
  state.completeChatGpt.mockResolvedValueOnce({
    status: "complete",
    url: null,
  });
  const completed = await callback(
    new NextRequest(
      "http://127.0.0.1:9876/auth/callback?state=fixture&code=private-code&client_id=oaiapp_fixture",
      { headers: { host: "127.0.0.1:9876" } },
    ),
  );
  expect(completed.status).toBe(200);
  const callbackUrl = state.completeChatGpt.mock.calls[0][0] as URL;
  expect(callbackUrl.origin).toBe("http://127.0.0.1:9876");
  expect(callbackUrl.pathname).toBe("/auth/callback");
  expect(callbackUrl.searchParams.get("code")).toBe("private-code");
  expect(callbackUrl.searchParams.get("client_id")).toBe("oaiapp_fixture");
  expect(await completed.text()).not.toContain("private-code");
  expect(completed.headers.get("referrer-policy")).toBe("no-referrer");
  state.completeChatGpt.mockRejectedValueOnce(new Error("private-access"));
  const rejected = await callback(
    new Request("http://127.0.0.1:9876/auth/callback?state=invalid"),
  );
  expect(rejected.status).toBe(400);
  expect(await rejected.text()).not.toContain("private-access");
});

test("an unexpected callback host never reaches the token exchange", async () => {
  const rejected = await callback(
    new NextRequest("http://evil.example/auth/callback?state=fixture", {
      headers: { host: "evil.example" },
    }),
  );
  expect(rejected.status).toBe(400);
  expect(state.completeChatGpt).not.toHaveBeenCalled();
});

test("a recoverable grant rejection redirects the existing sign-in tab to fresh authorization", async () => {
  const url =
    "https://auth.openai.com/api/accounts/authorize?client_id=oaiapp_fixture&state=fresh";
  state.completeChatGpt.mockResolvedValueOnce({ status: "pending", url });
  const response = await callback(
    new NextRequest(
      "http://127.0.0.1:9876/auth/callback?state=fixture&code=private-code",
      { headers: { host: "127.0.0.1:9876" } },
    ),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(url);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
});

test("the callback page explains a verified authorization that could not be saved without exposing private details", async () => {
  state.completeChatGpt.mockRejectedValueOnce(
    new ChatGptSignInError(
      "credential-storage",
      new Error("private-credential-detail<script>"),
    ),
  );
  const rejected = await callback(
    new NextRequest(
      "http://127.0.0.1:9876/auth/callback?state=fixture&code=private-code",
      { headers: { host: "127.0.0.1:9876" } },
    ),
  );
  const html = await rejected.text();
  expect(rejected.status).toBe(400);
  expect(html).toContain("ChatGPT authorization was verified");
  expect(html).toContain("OS credential store");
  expect(html).not.toMatch(/private-|<script>/);
});

test("only the exact loopback OAuth GET callback bypasses the cross-site session check", () => {
  const request = (path: string, host = "127.0.0.1:9876", method = "GET") =>
    new NextRequest(`http://${host}${path}`, {
      method,
      headers: { host, "sec-fetch-site": "cross-site" },
    });
  expect(proxy(request("/auth/callback?state=fixture")).status).toBe(200);
  expect(proxy(request("/auth/callback", "localhost:9876")).status).toBe(403);
  expect(proxy(request("/auth/callback", "evil.example")).status).toBe(403);
  expect(
    proxy(request("/auth/callback", "127.0.0.1:9876", "POST")).status,
  ).toBe(403);
  expect(proxy(request("/api/providers/subscriptions")).status).toBe(403);
});
