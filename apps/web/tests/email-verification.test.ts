import { expect, test, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { auth as configuredAuth } from "@/lib/auth/auth";

const state = vi.hoisted(() => ({ sendOTP: vi.fn() }));
vi.mock("@/services/mailjet/emails/verification-emails", () => ({
  sendVerificationOtp: state.sendOTP,
}));
vi.mock("@senslop/database", () => ({ db: {} }));
vi.mock("@/data/env/server", () => ({
  serverEnv: {
    BETTER_AUTH_SECRET: "test-secret-abcdefghijklmnopqrstuvwxyz0123456789",
    BETTER_AUTH_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "google-test-id",
    GOOGLE_CLIENT_SECRET: "google-test-secret",
    GITHUB_CLIENT_ID: "github-test-id",
    GITHUB_CLIENT_SECRET: "github-test-secret",
    CONNECTION_URL: "ws://localhost:3002/connection",
    CONNECTION_INTERNAL_SECRET:
      "test-secret-abcdefghijklmnopqrstuvwxyz0123456789",
  },
}));

test("email signup is gated by OTP, verification signs in, and password/device flows remain available", async () => {
  state.sendOTP.mockResolvedValue(undefined);
  const auth = betterAuth({
    ...configuredAuth.options,
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      deviceCode: [],
    }),
    rateLimit: { enabled: false },
    logger: { level: "error" },
  });
  const call = (path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  const email = "verification@example.com";
  const password = "password-for-testing-only-1234";
  const signup = await call("/sign-up/email", {
    email,
    password,
    name: "Verification test",
  });
  expect(signup.status).toBe(200);
  expect((await signup.json()).token).toBeNull();
  expect(signup.headers.get("set-cookie")).toBeNull();
  expect(state.sendOTP).toHaveBeenCalledWith(
    expect.objectContaining({
      email,
      type: "email-verification",
      otp: expect.stringMatching(/^\d{6}$/),
    }),
  );
  const signIn = await call("/sign-in/email", { email, password });
  expect(signIn.status).toBe(403);
  expect((await signIn.json()).code).toBe("EMAIL_NOT_VERIFIED");
  expect(state.sendOTP).toHaveBeenCalledTimes(2);
  const { otp } = state.sendOTP.mock.calls.at(-1)![0] as { otp: string };
  const wrongOTP = otp === "000000" ? "111111" : "000000";
  expect(
    (await call("/email-otp/verify-email", { email, otp: wrongOTP })).status,
  ).toBe(400);
  const verification = await call("/email-otp/verify-email", { email, otp });
  expect(verification.status).toBe(200);
  const verified = await verification.json();
  expect(verified.user.emailVerified).toBe(true);
  expect(verified.token).toEqual(expect.any(String));
  const cookie = verification.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const session = await auth.api.getSession({
    headers: new Headers({ Cookie: cookie }),
    query: { disableCookieCache: true },
  });
  expect(session?.user.emailVerified).toBe(true);
  expect((await call("/email-otp/verify-email", { email, otp })).status).toBe(
    400,
  );
  expect((await call("/sign-in/email", { email, password })).status).toBe(200);
  const requestedCode = await call("/device/code", {
    client_id: "senslop-cli",
  });
  expect(requestedCode.status).toBe(200);
  const { user_code } = await requestedCode.json();
  const claim = await auth.handler(
    new Request(
      `http://localhost:3000/api/auth/device?user_code=${user_code}`,
      { headers: { Cookie: cookie } },
    ),
  );
  expect(claim.status).toBe(200);
  expect(
    (await call("/device/approve", { userCode: user_code }, cookie)).status,
  ).toBe(200);
});
