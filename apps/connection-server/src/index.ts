import { and, eq, gt } from "drizzle-orm";
import { consumeTicket, db, DeviceTable, sessions } from "@senslop/database";
import { secureBaseURL } from "@senslop/contracts";
import { createPresenceServer } from "./server";
import { authenticateCLI } from "./auth";
import { serverEnv } from "./data/env/server";

const websiteOrigin = secureBaseURL(serverEnv.BETTER_AUTH_URL);
const internalSecret = serverEnv.CONNECTION_INTERNAL_SECRET;

const { server } = createPresenceServer(
  {
    websiteOrigin,
    internalSecret,
    port: serverEnv.CONNECTION_PORT,
    host: "0.0.0.0",
  },
  {
    authenticateCLI: (token) => authenticateCLI(token, websiteOrigin),

    recordCLIConnection: async (identity) => {
      await db
        .update(DeviceTable)
        .set({ lastConnectedAt: new Date() })
        .where(
          and(
            eq(DeviceTable.id, identity.deviceId!),
            eq(DeviceTable.userId, identity.userId),
          ),
        );
    },

    consumeBrowserTicket: async (ticket, origin) => {
      const deletedConnectionTicket = await consumeTicket(ticket, origin);
      return deletedConnectionTicket
        ? {
            userId: deletedConnectionTicket.userId,
            sessionId: deletedConnectionTicket.sessionId,
          }
        : null;
    },

    validBrowserSession: async (identity) => {
      const [existingSession] = await db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.id, identity.sessionId),
            eq(sessions.userId, identity.userId),
            gt(sessions.expiresAt, new Date()),
          ),
        );
      return Boolean(existingSession);
    },
  },
);

server.on("listening", () => console.log("Senslop connection service ready"));

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => server.close());
