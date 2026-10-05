import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users, sessions } from "./user";

export const DeviceTable = pgTable(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .unique()
      .references(() => sessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    lastConnectedAt: timestamp("last_connected_at"),
  },
  (table) => [index("devices_user_idx").on(table.userId)],
);
export const DeviceRelations = relations(DeviceTable, ({ one }) => ({
  user: one(users, {
    fields: [DeviceTable.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [DeviceTable.sessionId],
    references: [sessions.id],
  }),
}));
export type DeviceSelectData = typeof DeviceTable.$inferSelect;
export type DeviceInsertData = typeof DeviceTable.$inferInsert;
