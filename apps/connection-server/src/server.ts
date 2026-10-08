import express, { type ErrorRequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  PROTOCOL_VERSION,
} from "@senslop/contracts";
import { PresenceRegistry, type Identity } from "./presence";
import { mountPreviewRoutes } from "./features/preview/routes";

export type PresenceConfig = {
  websiteOrigin: string;
  internalSecret: string;
  port?: number;
  host?: string;
};

export type PresenceDependencies = {
  authenticateCLI(token: string): Promise<Identity | null>;
  consumeBrowserTicket(
    ticket: string,
    origin: string,
  ): Promise<Identity | null>;
  validBrowserSession(identity: Identity): Promise<boolean>;
  recordCLIConnection?(identity: Identity): Promise<void>;
};

const secretMatches = (value: string, expected: string) => {
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export const createPresenceServer = (
  config: PresenceConfig,
  dependencies: PresenceDependencies,
) => {
  const registry = new PresenceRegistry();
  const app = express();
  app.disable("x-powered-by");

  app.get("/health", (_request, response) => {
    response.type("text").send("ok");
  });

  app.post(
    "/internal/disconnect",
    (request, response, next) => {
      if (
        !secretMatches(
          request.get("authorization") ?? "",
          `Bearer ${config.internalSecret}`,
        )
      ) {
        response.sendStatus(401);
        return;
      }
      next();
    },
    express.json({ limit: 1024, inflate: false }),
    (request, response) => {
      const body: unknown = request.body;
      if (
        !body ||
        typeof body !== "object" ||
        !("sessionId" in body) ||
        typeof body.sessionId !== "string" ||
        !body.sessionId.trim()
      ) {
        response.sendStatus(400);
        return;
      }
      registry.disconnectSession(body.sessionId);
      response.sendStatus(204);
    },
  );

  mountPreviewRoutes(app, registry, dependencies);

  const handleError: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    next,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    const status =
      error &&
      typeof error === "object" &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : 500;
    response.sendStatus(status >= 400 && status < 600 ? status : 500);
  };
  app.use(handleError);

  const server = app.listen(config.port ?? 0, config.host ?? "127.0.0.1");
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
  });
  const states = new Map<
    WebSocket,
    {
      identity: Identity;
      token?: string;
      lastPong: number;
      checking: boolean;
    }
  >();
  server.on("upgrade", (request, socket, head) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://connection.local");
      if (
        url.pathname !== "/connection" ||
        url.searchParams.get("protocolVersion") !== String(PROTOCOL_VERSION)
      ) {
        socket.end(
          "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\nUnsupported protocol. Upgrade Senslop CLI.",
        );
        return;
      }
      const header = request.headers.authorization;
      const ticket = url.searchParams.get("ticket");
      let identity: Identity | null = null;
      let token: string | undefined;
      // Browser origin and bearer modes cannot be combined or downgraded.
      if (header?.startsWith("Bearer ") && !request.headers.origin && !ticket) {
        token = header.slice(7);
        identity = await dependencies.authenticateCLI(token);
      } else if (
        !header &&
        ticket &&
        request.headers.origin === config.websiteOrigin
      ) {
        identity = await dependencies.consumeBrowserTicket(
          ticket,
          request.headers.origin,
        );
        if (identity && !(await dependencies.validBrowserSession(identity)))
          identity = null;
      }
      if (!identity) {
        socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        return;
      }
      if (identity.deviceId) await dependencies.recordCLIConnection?.(identity);
      const accepted = identity;
      websocketServer.handleUpgrade(request, socket, head, (ws) => {
        states.set(ws, {
          identity: accepted,
          token,
          lastPong: Date.now(),
          checking: false,
        });
        const remove = registry.add(ws, accepted);
        ws.on("pong", () => {
          const state = states.get(ws);
          if (state) state.lastPong = Date.now();
        });
        ws.on("message", () =>
          ws.close(1008, "Presence does not accept commands"),
        );
        ws.on("error", () => ws.terminate());
        ws.on("close", () => {
          states.delete(ws);
          remove();
        });
      });
    })().catch(() =>
      socket.end(
        "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n",
      ),
    );
  });
  const heartbeat = setInterval(() => {
    for (const [ws, state] of states) {
      if (Date.now() - state.lastPong >= HEARTBEAT_TIMEOUT_MS) {
        ws.terminate();
        continue;
      }
      if (state.checking) continue;
      state.checking = true;
      void (async () => {
        const valid = state.token
          ? await dependencies.authenticateCLI(state.token)
          : await dependencies.validBrowserSession(state.identity);
        if (
          !valid ||
          (typeof valid !== "boolean" &&
            (valid.userId !== state.identity.userId ||
              valid.sessionId !== state.identity.sessionId))
        )
          ws.close(4001, "Session expired or revoked");
        else if (ws.readyState === WebSocket.OPEN) ws.ping();
      })()
        .catch(() => ws.close(1013, "Account service unavailable"))
        .finally(() => {
          state.checking = false;
        });
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();
  server.on("close", () => {
    clearInterval(heartbeat);
    for (const ws of states.keys()) ws.terminate();
    websocketServer.close();
  });
  return { server, registry };
};
