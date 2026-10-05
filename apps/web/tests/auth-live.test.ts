import { randomUUID } from "node:crypto";
import { createEmailFreeAuthFixture } from "./auth-fixture";
import { expect, test } from "vitest";

// This explicit opt-in is test-runner configuration, outside application env access.
const runLiveTests = process.env.RUN_LIVE_TESTS === "1";

test.skipIf(!runLiveTests)(
  "Neon persists device authorization, isolates identities, consumes tickets once, and revokes credentials",
  async () => {
    const [
      { auth },
      database,
      { eq, inArray },
      { serverEnv },
      cliStatus,
      browserTickets,
    ] = await Promise.all([
      import("../src/lib/auth/auth"),
      import("@senslop/database"),
      import("drizzle-orm"),
      import("../src/data/env/server"),
      import("../src/app/api/cli/status/route"),
      import("../src/app/api/connection-ticket/route"),
    ]);
    const { db, users, deviceCodes, consumeTicket } = database;
    // The migration env validates the development-only guard before any test writes.
    await import("../../../packages/database/src/data/env/migration");
    const origin = new URL(serverEnv.BETTER_AUTH_URL).origin;
    const prefix = `senslop-live-${randomUUID()}`;
    const ownedEmails = [
      `${prefix}-a@example.invalid`,
      `${prefix}-b@example.invalid`,
    ];
    let ownedDeviceCode: string | undefined;
    const callAuth = (
      path: string,
      body?: unknown,
      cookie?: string,
      token?: string,
    ) =>
      auth.handler(
        new Request(`${origin}/api/auth${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            ...(cookie ? { Cookie: cookie } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
    const fixtureAuth = createEmailFreeAuthFixture(auth.options);
    const signup = async (email: string) => {
      const password = `disposable-password-${randomUUID()}`;
      const response = await fixtureAuth.handler(
        new Request(`${origin}/api/auth/sign-up/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({
            email,
            password,
            name: "Disposable integration account",
          }),
        }),
      );
      expect(response.status).toBe(200);
      const payload = (await response.json()) as { user: { id: string } };
      await db
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, payload.user.id));
      const signedIn = await callAuth("/sign-in/email", { email, password });
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      expect(Boolean(cookie)).toBe(true);
      return { id: payload.user.id, cookie };
    };
    const ticketRequest = (
      cookie: string,
      requestOrigin = origin,
      token?: string,
    ) =>
      new Request(`${origin}/api/connection-ticket`, {
        method: "POST",
        headers: {
          Origin: requestOrigin,
          Cookie: cookie,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    const statusRequest = (token?: string, cookie?: string) =>
      new Request(`${origin}/api/cli/status`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });

    try {
      const accountA = await signup(ownedEmails[0]);
      const accountB = await signup(ownedEmails[1]);
      const requestedCode = await callAuth("/device/code", {
        client_id: "senslop-cli",
      });
      expect(requestedCode.status).toBe(200);
      const code = (await requestedCode.json()) as {
        user_code: string;
        device_code: string;
      };
      ownedDeviceCode = code.device_code;
      expect(
        (
          await callAuth(
            "/device/approve",
            { userCode: code.user_code },
            accountA.cookie,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await callAuth(
            `/device?user_code=${encodeURIComponent(code.user_code)}`,
            undefined,
            accountA.cookie,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await callAuth(
            "/device/approve",
            { userCode: code.user_code },
            accountB.cookie,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await callAuth(
            "/device/approve",
            { userCode: code.user_code },
            accountA.cookie,
          )
        ).status,
      ).toBe(200);
      const granted = await callAuth("/device/token", {
        device_code: code.device_code,
        client_id: "senslop-cli",
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
      expect(granted.status).toBe(200);
      const { access_token: token } = (await granted.json()) as {
        access_token: string;
      };
      expect(typeof token).toBe("string");
      const existingSession = await auth.api.getSession({
        headers: new Headers({ Authorization: `Bearer ${token}` }),
        query: { disableCookieCache: true },
      });
      expect(existingSession?.user.id).toBe(accountA.id);
      expect(
        (await cliStatus.GET(statusRequest(undefined, accountA.cookie))).status,
      ).toBe(401);
      const existingStatus = await cliStatus.GET(
        statusRequest(token, accountB.cookie),
      );
      expect(existingStatus.status).toBe(200);
      const status = (await existingStatus.json()) as {
        user: { id: string };
        deviceId: string;
      };
      expect(status.user.id).toBe(accountA.id);
      expect(status.deviceId).toBe(existingSession!.session.id);

      expect(
        (
          await browserTickets.POST(
            ticketRequest(accountA.cookie, "https://wrong-origin.example"),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await browserTickets.POST(
            ticketRequest(accountA.cookie, origin, token),
          )
        ).status,
      ).toBe(401);
      const ticketAResponse = await browserTickets.POST(
        ticketRequest(accountA.cookie),
      );
      expect(ticketAResponse.status).toBe(200);
      const ticketA = (await ticketAResponse.json()) as { ticket: string };
      expect(
        await consumeTicket(ticketA.ticket, "https://wrong-origin.example"),
      ).toBeNull();
      const consumedConnectionTickets = await Promise.all([
        consumeTicket(ticketA.ticket, origin),
        consumeTicket(ticketA.ticket, origin),
      ]);
      const validTickets = consumedConnectionTickets.filter(
        (ticket) => ticket !== null,
      );
      expect(validTickets).toHaveLength(1);
      expect(validTickets[0]?.userId).toBe(accountA.id);
      expect(await consumeTicket(ticketA.ticket, origin)).toBeNull();
      const ticketBResponse = await browserTickets.POST(
        ticketRequest(accountB.cookie),
      );
      expect(ticketBResponse.status).toBe(200);
      const ticketB = (await ticketBResponse.json()) as { ticket: string };
      const deletedConnectionTicketB = await consumeTicket(
        ticketB.ticket,
        origin,
      );
      expect(deletedConnectionTicketB?.userId).toBe(accountB.id);
      expect(deletedConnectionTicketB?.userId).not.toBe(accountA.id);

      expect((await callAuth("/sign-out", {}, undefined, token)).status).toBe(
        200,
      );
      expect(
        await auth.api.getSession({
          headers: new Headers({ Authorization: `Bearer ${token}` }),
          query: { disableCookieCache: true },
        }),
      ).toBeNull();
      expect(
        (await cliStatus.GET(statusRequest(token, accountB.cookie))).status,
      ).toBe(401);
      expect(
        (await browserTickets.POST(ticketRequest(accountB.cookie))).status,
      ).toBe(200);
    } finally {
      try {
        if (ownedDeviceCode)
          await db
            .delete(deviceCodes)
            .where(eq(deviceCodes.deviceCode, ownedDeviceCode));
        await db.delete(users).where(inArray(users.email, ownedEmails));
      } finally {
        await db.$client.end();
      }
    }
  },
  60000,
);
