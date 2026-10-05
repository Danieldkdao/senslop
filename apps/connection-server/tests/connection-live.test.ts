import { randomUUID } from "node:crypto";
import { createEmailFreeAuthFixture } from "../../web/tests/auth-fixture";
import { once } from "node:events";
import { expect, test } from "vitest";
import { WebSocket } from "ws";
import type { PresenceEventSchema } from "@senslop/contracts";

// This opt-in belongs to the test runner, outside application environment access.
const runLiveHTTPTests = process.env.RUN_LIVE_HTTP_TESTS === "1";

test.skipIf(!runLiveHTTPTests)(
  "live Next and Express share account-scoped presence and immediately revoke CLI sockets",
  async () => {
    const [database, { eq, inArray }, { serverEnv }, { auth }] =
      await Promise.all([
        import("@senslop/database"),
        import("drizzle-orm"),
        import("../../web/src/data/env/server"),
        import("../../web/src/lib/auth/auth"),
      ]);
    const { db, users, deviceCodes } = database;
    // Validate the development-only database guard before creating disposable accounts.
    await import("../../../packages/database/src/data/env/migration");
    const origin = new URL(serverEnv.BETTER_AUTH_URL).origin;
    const socketURL = new URL(serverEnv.CONNECTION_URL);
    socketURL.searchParams.set("protocolVersion", "1");
    const prefix = `senslop-http-live-${randomUUID()}`;
    const ownedEmails = [
      `${prefix}-a@example.invalid`,
      `${prefix}-b@example.invalid`,
    ];
    const sockets: WebSocket[] = [];
    let ownedDeviceCode: string | undefined;
    const callAuth = (
      path: string,
      body?: unknown,
      cookie?: string,
      token?: string,
    ) =>
      fetch(`${origin}/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
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
            name: "Disposable transport account",
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
      return cookie;
    };
    const requestTicket = async (cookie: string) => {
      const response = await fetch(`${origin}/api/connection-ticket`, {
        method: "POST",
        headers: { Cookie: cookie, Origin: origin },
        signal: AbortSignal.timeout(10000),
      });
      expect(response.status).toBe(200);
      return ((await response.json()) as { ticket: string }).ticket;
    };
    const createSocket = (
      url: URL,
      options: { origin?: string; headers?: Record<string, string> },
    ) => {
      const socket = new WebSocket(url, {
        ...options,
        handshakeTimeout: 10000,
      });
      socket.on("error", () => {});
      sockets.push(socket);
      return socket;
    };
    const connectBrowser = async (ticket: string) => {
      const url = new URL(socketURL);
      url.searchParams.set("ticket", ticket);
      const socket = createSocket(url, { origin });
      const events: PresenceEventSchema[] = [];
      socket.on("message", (bytes) =>
        events.push(JSON.parse(bytes.toString()) as PresenceEventSchema),
      );
      await once(socket, "open");
      return { socket, events };
    };
    const latestDevices = (events: PresenceEventSchema[]) => {
      const snapshot = [...events]
        .reverse()
        .find((event) => event.type === "presence.snapshot");
      return snapshot?.type === "presence.snapshot"
        ? snapshot.devices.map((device) => device.id)
        : undefined;
    };
    const rejectedTicket = (ticket: string) =>
      new Promise<number>((resolve, reject) => {
        const url = new URL(socketURL);
        url.searchParams.set("ticket", ticket);
        const socket = createSocket(url, { origin });
        let receivedHTTPResponse = false;
        socket.once("unexpected-response", (_request, response) => {
          receivedHTTPResponse = true;
          const status = response.statusCode!;
          response.resume();
          socket.terminate();
          resolve(status);
        });
        socket.once("open", () => {
          socket.close();
          reject(
            new Error("A consumed ticket unexpectedly opened another socket"),
          );
        });
        socket.once("error", (error) => {
          if (!receivedHTTPResponse) reject(error);
        });
      });

    try {
      for (const path of ["/", "/login", "/signup", "/device"]) {
        const response = await fetch(`${origin}${path}`, {
          signal: AbortSignal.timeout(10000),
          redirect: "manual",
        });
        if (path === "/device") {
          expect(response.status).toBe(307);
          expect(new URL(response.headers.get("location")!).pathname).toBe(
            "/login",
          );
          continue;
        }
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html.match(/<header\b/g) ?? []).toHaveLength(0);
      }
      const cookieA = await signup(ownedEmails[0]);
      const cookieB = await signup(ownedEmails[1]);
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
            `/device?user_code=${encodeURIComponent(code.user_code)}`,
            undefined,
            cookieA,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await callAuth(
            "/device/approve",
            { userCode: code.user_code },
            cookieA,
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
      const statusResponse = await fetch(`${origin}/api/cli/status`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
      expect(statusResponse.status).toBe(200);
      const { deviceId } = (await statusResponse.json()) as {
        deviceId: string;
      };
      const ticketA = await requestTicket(cookieA);
      const browserA = await connectBrowser(ticketA);
      const browserB = await connectBrowser(await requestTicket(cookieB));
      await expect
        .poll(() => latestDevices(browserA.events), { timeout: 5000 })
        .toEqual([]);
      await expect
        .poll(() => latestDevices(browserB.events), { timeout: 5000 })
        .toEqual([]);
      expect(await rejectedTicket(ticketA)).toBe(401);
      let cli = createSocket(socketURL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await once(cli, "open");
      await expect
        .poll(() => latestDevices(browserA.events), { timeout: 5000 })
        .toEqual([deviceId]);
      expect(
        browserA.events.some(
          (event) =>
            event.type === "cli.connected" && event.deviceId === deviceId,
        ),
      ).toBe(true);
      const roundTrip = once(browserB.socket, "pong");
      browserB.socket.ping();
      await roundTrip;
      expect(latestDevices(browserB.events)).toEqual([]);
      expect(
        browserB.events.some((event) => event.type === "cli.connected"),
      ).toBe(false);
      const closed = once(cli, "close");
      cli.close();
      await closed;
      await expect
        .poll(() => latestDevices(browserA.events), { timeout: 5000 })
        .toEqual([]);
      cli = createSocket(socketURL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await once(cli, "open");
      await expect
        .poll(() => latestDevices(browserA.events), { timeout: 5000 })
        .toEqual([deviceId]);
      const revoked = once(cli, "close");
      expect((await callAuth("/sign-out", {}, undefined, token)).status).toBe(
        200,
      );
      await expect
        .poll(() => cli.readyState, { timeout: 5000 })
        .toBe(WebSocket.CLOSED);
      expect((await revoked)[0]).toBe(4001);
      await expect
        .poll(() => latestDevices(browserA.events), { timeout: 5000 })
        .toEqual([]);
      expect(latestDevices(browserB.events)).toEqual([]);
      expect(
        (
          await fetch(`${origin}/api/cli/status`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          })
        ).status,
      ).toBe(401);
    } finally {
      for (const socket of sockets) socket.terminate();
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
