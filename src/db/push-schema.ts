import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { session, user } from "./schema";

export const webPushSubscriptions = sqliteTable(
  "web_push_subscriptions",
  {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["professional", "patient"] }).notNull(),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    endpointHash: text("endpoint_hash").notNull(),
    sealedSubscription: text("sealed_subscription"),
    vapidKeyHash: text("vapid_key_hash").notNull(),
    preferencesJson: text("preferences_json").notNull(),
    revision: integer("revision").notNull().default(1),
    consentAt: integer("consent_at").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    revokedAt: integer("revoked_at"),
  },
  (t) => [
    uniqueIndex("web_push_endpoint_idx").on(t.endpointHash),
    index("web_push_owner_idx").on(t.userId, t.role, t.revokedAt),
    index("web_push_scan_idx").on(t.revokedAt, t.updatedAt, t.id),
    check("web_push_role_check", sql`${t.role} IN ('professional','patient')`),
    check("web_push_preferences_check", sql`json_valid(${t.preferencesJson})`),
    check("web_push_revision_check", sql`${t.revision} >= 1`),
  ],
);

export const webPushDeliveries = sqliteTable(
  "web_push_deliveries",
  {
    id: text("id").primaryKey().notNull(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => webPushSubscriptions.id, { onDelete: "cascade" }),
    eventHash: text("event_hash").notNull(),
    kind: text("kind", {
      enum: ["chat", "appointment", "after_session"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    eventVersion: text("event_version").notNull(),
    preferenceRevision: integer("preference_revision").notNull(),
    dueAt: integer("due_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
    status: text("status", {
      enum: ["pending", "sending", "sent", "skipped", "dead"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    leaseUntil: integer("lease_until"),
    claimToken: text("claim_token"),
    reasonCode: text("reason_code"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("web_push_event_idx").on(t.subscriptionId, t.eventHash),
    index("web_push_deliveries_due_idx").on(t.status, t.nextAttemptAt, t.id),
    index("web_push_deliveries_expiry_idx").on(t.expiresAt),
    check(
      "web_push_kind_check",
      sql`${t.kind} IN ('chat','appointment','after_session')`,
    ),
    check(
      "web_push_status_check",
      sql`${t.status} IN ('pending','sending','sent','skipped','dead')`,
    ),
    check("web_push_attempts_check", sql`${t.attempts} BETWEEN 0 AND 4`),
  ],
);
