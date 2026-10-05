import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "./client";
import { ConnectionTicketTable } from "./schemas/connection-ticket";

const TICKET_TTL_MS = 30000;

const hashTicket = (ticket: string) => {
  return createHash("sha256").update(ticket).digest("hex");
};
export const issueTicket = async (
  userId: string,
  sessionId: string,
  origin: string,
) => {
  const ticket = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
  await db
    .delete(ConnectionTicketTable)
    .where(lt(ConnectionTicketTable.expiresAt, new Date()));
  await db
    .insert(ConnectionTicketTable)
    .values({ hash: hashTicket(ticket), userId, sessionId, origin, expiresAt });
  return { ticket, expiresAt: expiresAt.toISOString() };
};

export const consumeTicket = async (ticket: string, origin: string) => {
  if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) return null;
  try {
    // DELETE RETURNING is atomic across processes; wrong origins cannot consume it.
    const [deletedConnectionTicket] = await db
      .delete(ConnectionTicketTable)
      .where(
        and(
          eq(ConnectionTicketTable.hash, hashTicket(ticket)),
          eq(ConnectionTicketTable.origin, origin),
          gt(ConnectionTicketTable.expiresAt, new Date()),
        ),
      )
      .returning();
    return deletedConnectionTicket ?? null;
  } catch {
    return null;
  }
};
