import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dashboardData = sqliteTable("dashboard_data", {
  period: text("period").notNull(),
  scope: text("scope").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [primaryKey({ columns: [table.period, table.scope] })]);

export const loginAttempts = sqliteTable("login_attempts", {
  keyHash: text("key_hash").primaryKey(),
  windowStarted: integer("window_started").notNull(),
  attempts: integer("attempts").notNull().default(0),
});
