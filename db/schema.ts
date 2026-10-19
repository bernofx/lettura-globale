import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userStates = sqliteTable("user_states", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  payload: text("payload").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  revision: integer("revision").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const therapistCredentials = sqliteTable("therapist_credentials", {
  loginEmail: text("login_email").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  therapistId: text("therapist_id").notNull(),
  pinHash: text("pin_hash").notNull(),
  displayName: text("display_name").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const sharedLaunches = sqliteTable("shared_launches", {
  token: text("token").primaryKey(),
  ownerUserId: text("owner_user_id").notNull(),
  kind: text("kind").notNull(),
  contentId: text("content_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
