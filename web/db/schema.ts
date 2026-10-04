import { sql } from "drizzle-orm";
import { bigserial, boolean, check, date, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// Every city and town with 1,000 or more people, from GeoNames (CC BY 4.0). Loaded by db/import-places.mjs.
export const places = pgTable(
  "places",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    asciiName: text("ascii_name").notNull(),
    admin1: text("admin1"),
    admin1Ascii: text("admin1_ascii"),
    admin1Code: text("admin1_code"),
    countryCode: text("country_code").notNull(),
    country: text("country").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    timeZone: text("time_zone").notNull(),
    population: integer("population").notNull().default(0),
  },
  (t) => [
    index("places_ascii_prefix").using("btree", sql`lower(${t.asciiName}) text_pattern_ops`),
    index("places_name_prefix").using("btree", sql`lower(${t.name}) text_pattern_ops`),
  ],
);

// Stripe's subscription statuses, stored as Stripe reports them.
export const SUBSCRIPTION_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    localWeather: boolean("local_weather").notNull().default(true),
    placeId: integer("place_id").references(() => places.id),
    timeZone: text("time_zone"),
    format: text("format", { enum: ["small", "large", "epub"] }),
    deliveryEmail: text("delivery_email"),
    deliveryEmailVerifiedAt: timestamp("delivery_email_verified_at", { withTimezone: true }),
    deliveryStatus: text("delivery_status", { enum: ["active", "paused"] }).notNull().default("active"),
    // "download" readers have no inbox to send to; each morning's paper waits behind their private link.
    deliveryMethod: text("delivery_method", { enum: ["email", "download"] }).notNull().default("email"),
    // Part of the private download link's signature. Raising it makes every older link stop working.
    readLinkVersion: integer("read_link_version").notNull().default(1),
    termsVersion: text("terms_version"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    // The free trial starts with the first paper delivered after billing opens, so days spent
    // waiting for launch don't count. Null means the trial hasn't started.
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    trialReminderSentAt: timestamp("trial_reminder_sent_at", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    subscriptionStatus: text("subscription_status", { enum: SUBSCRIPTION_STATUSES }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    billingConsentVersion: text("billing_consent_version"),
    billingConsentAt: timestamp("billing_consent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("users_email_lower", sql`${t.email} = lower(${t.email})`),
    check("users_format", sql`${t.format} in ('small', 'large', 'epub')`),
    check("users_delivery_status", sql`${t.deliveryStatus} in ('active', 'paused')`),
    check("users_delivery_method", sql`${t.deliveryMethod} in ('email', 'download')`),
    check(
      "users_subscription_status",
      sql.raw(`subscription_status in (${SUBSCRIPTION_STATUSES.map((s) => `'${s}'`).join(", ")})`),
    ),
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

// Written by the pipeline's delivery job. One row per reader per local date, so a rerun
// can never send the same day's paper twice.
export const deliveries = pgTable(
  "deliveries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    editionDate: date("edition_date").notNull(),
    editionKey: text("edition_key").notNull(),
    format: text("format").notNull(),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    providerId: text("provider_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("deliveries_user_date").on(t.userId, t.editionDate),
    index("deliveries_date").on(t.editionDate),
    check("deliveries_status", sql`${t.status} in ('pending', 'sent', 'failed')`),
  ],
);

// What was sent to The Conversation under the republishing agreement: one copy per
// edition date that ran their articles, and one usage report per month.
export const partnerCopies = pgTable("partner_copies", {
  editionDate: date("edition_date").primaryKey(),
  articles: integer("articles").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const partnerReports = pgTable("partner_reports", {
  month: text("month").primaryKey(),
  articles: integer("articles").notNull(),
  subscribers: integer("subscribers").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

// Each Stripe webhook event id is recorded once, so a redelivered event is never applied twice.
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Place = typeof places.$inferSelect;
