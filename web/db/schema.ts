import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid, bigserial } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    cityId: text("city_id"),
    format: text("format", { enum: ["small", "large", "epub"] }),
    deliveryEmail: text("delivery_email"),
    deliveryEmailVerifiedAt: timestamp("delivery_email_verified_at", { withTimezone: true }),
    deliveryStatus: text("delivery_status", { enum: ["active", "paused"] }).notNull().default("active"),
    termsVersion: text("terms_version"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("users_email_lower", sql`${t.email} = lower(${t.email})`),
    check("users_format", sql`${t.format} in ('small', 'large', 'epub')`),
    check("users_delivery_status", sql`${t.deliveryStatus} in ('active', 'paused')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user").on(t.userId)],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    purpose: text("purpose", { enum: ["sign_in", "verify_delivery"] }).notNull(),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("email_tokens_expires").on(t.expiresAt),
    check("email_tokens_purpose", sql`${t.purpose} in ('sign_in', 'verify_delivery')`),
  ],
);

export const rateEvents = pgTable(
  "rate_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rate_events_key_time").on(t.key, t.createdAt)],
);

// user_id is a plain column, not a foreign key, so the trail survives account deletion.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id"),
    event: text("event").notNull(),
    ip: text("ip"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_time").on(t.createdAt), index("audit_events_user").on(t.userId)],
);

export type User = typeof users.$inferSelect;
