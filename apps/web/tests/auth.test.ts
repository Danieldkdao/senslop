import { test, expect, vi, afterEach } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
const verificationEmails = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/services/mailjet/emails/verification-emails", () => ({
  sendVerificationOtp: verificationEmails.send,
}));

// This exercises the installed Better Auth plugins with a deterministic adapter.
// It proves the token contract, not Neon/Drizzle integration or live persistence.
test("device approval requires its claiming account; bearer session is revocable", async () => {
  // Isolated test configuration: the production pool is never queried.
  const testEnv = {
    DATABASE_URL: "postgresql://test:test@localhost:5432/senslop_test",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-abcdefghijklmnopqrstuvwxyz0123456789",
    MAILJET_API_KEY: "test-mailjet-key",
    MAILJET_API_SECRET: "test-mailjet-secret",
    SENDER_EMAIL: "sender@example.com",
    GOOGLE_CLIENT_ID: "google-test-id",
    GOOGLE_CLIENT_SECRET: "google-test-secret",
    GITHUB_CLIENT_ID: "github-test-id",
    GITHUB_CLIENT_SECRET: "github-test-secret",
    OPENROUTER_API_KEY: "test-key",
    TRIGGER_SECRET_KEY: "test-key",
    TRIGGER_PROJECT_REF: "test-project",
    CONNECTION_URL: "ws://localhost:3002/connection",
    CONNECTION_INTERNAL_SECRET:
      "test-internal-abcdefghijklmnopqrstuvwxyz0123456789",
  };
  for (const [key, value] of Object.entries(testEnv)) vi.stubEnv(key, value);
  const disconnect = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }));
  const { auth: configuredAuth } = await import("../src/lib/auth/auth");
  const store = {
    user: [],
    session: [],
    account: [],
    verification: [],
    deviceCode: [],
  };
  const auth = betterAuth({
    ...configuredAuth.options,
    database: memoryAdapter(store),
    rateLimit: { enabled: false },
    logger: { level: "error" },
  });
  const call = (
    path: string,
    body?: unknown,
    cookie?: string,
    token?: string,
  ) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  const signup = async (email: string) => {
    const response = await call("/sign-up/email", {
      email,
      password: "password-for-testing-only-1234",
      name: email,
    });
    expect(response.status).toBe(200);
    const { otp } = verificationEmails.send.mock.calls
      .filter(([message]) => message.email === email)
      .at(-1)![0] as { otp: string };
    const verified = await call("/email-otp/verify-email", { email, otp });
    expect(verified.status).toBe(200);
    return verified.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  };
  for (const provider of ["google", "github"] as const) {
    const response = await call("/sign-in/social", {
      provider,
      callbackURL: "/device?user_code=TEST-CODE",
      disableRedirect: true,
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { url: string };
    const authorizationURL = new URL(payload.url);
    expect(authorizationURL.hostname).toBe(
      provider === "google" ? "accounts.google.com" : "github.com",
    );
    expect(authorizationURL.searchParams.get("client_id")).toBe(
      `${provider}-test-id`,
    );
    expect(authorizationURL.searchParams.get("redirect_uri")).toBe(
      `http://localhost:3000/api/auth/callback/${provider}`,
    );
  }

  const cookieA = await signup("a@example.com");
  const cookieB = await signup("b@example.com");
  const invalidClient = await call("/device/code", {
    client_id: "unknown-client",
  });
  expect(invalidClient.status).toBe(400);
  const requested = await call("/device/code", { client_id: "senslop-cli" });
  expect(requested.status).toBe(200);
  const code = (await requested.json()) as {
    user_code: string;
    device_code: string;
  };
  const unclaimed = await call(
    "/device/approve",
    { userCode: code.user_code },
    cookieA,
  );
  expect(unclaimed.status).toBe(400);
  expect(
    (
      await call(
        `/device?user_code=${encodeURIComponent(code.user_code)}`,
        undefined,
        cookieA,
      )
    ).status,
  ).toBe(200);
  expect(
    (await call("/device/approve", { userCode: code.user_code }, cookieB))
      .status,
  ).toBe(403);
  expect(
    (await call("/device/approve", { userCode: code.user_code }, cookieA))
      .status,
  ).toBe(200);
  const granted = await call("/device/token", {
    device_code: code.device_code,
    client_id: "senslop-cli",
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  expect(granted.status).toBe(200);
  const token = (
    (await granted.json()) as {
      access_token: string;
    }
  ).access_token;
  const session = await auth.api.getSession({
    headers: new Headers({ Authorization: `Bearer ${token}` }),
    query: { disableCookieCache: true },
  });
  expect(session?.user.email).toBe("a@example.com");
  const signout = await call("/sign-out", {}, undefined, token);
  expect(signout.status).toBe(200);
  expect(disconnect).toHaveBeenCalledWith(
    new URL("http://localhost:3002/internal/disconnect"),
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ sessionId: session!.session.id }),
    }),
  );
  expect(
    await auth.api.getSession({
      headers: new Headers({ Authorization: `Bearer ${token}` }),
      query: { disableCookieCache: true },
    }),
  ).toBe(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
