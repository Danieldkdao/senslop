import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, sessions } from "./user";

export const ConnectionTicketTable = pgTable(
  "connection_tickets",
  {
    hash: text("hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    origin: text("origin").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("connection_ticket_expiry_idx").on(table.expiresAt)],
);
export const ConnectionTicketRelations = relations(
  ConnectionTicketTable,
  ({ one }) => ({
    user: one(users, {
      fields: [ConnectionTicketTable.userId],
      references: [users.id],
    }),
    session: one(sessions, {
      fields: [ConnectionTicketTable.sessionId],
      references: [sessions.id],
    }),
  }),
);
export type ConnectionTicketSelectData =
  typeof ConnectionTicketTable.$inferSelect;
export type ConnectionTicketInsertData =
  typeof ConnectionTicketTable.$inferInsert;
