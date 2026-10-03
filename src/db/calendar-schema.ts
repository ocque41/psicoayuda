import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { practiceAppointments, user } from "./schema";

export const googleCalendarConnections = sqliteTable(
  "google_calendar_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(),
    tokenEnvelope: text("token_envelope").notNull(),
    calendarId: text("calendar_id"),
    status: text("status").notNull().default("connected"),
    googleReminders: integer("google_reminders", { mode: "boolean" })
      .notNull()
      .default(false),
    autoSync: integer("auto_sync", { mode: "boolean" })
      .notNull()
      .default(false),
    preferencesRevision: integer("preferences_revision").notNull().default(0),
    syncCursor: text("sync_cursor"),
    leaseId: text("lease_id"),
    leaseUntil: text("lease_until"),
    lastSyncedAt: text("last_synced_at"),
    errorCode: text("error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("google_calendar_user_audience_idx").on(t.userId, t.audience),
    index("google_calendar_auto_sync_idx").on(
      t.status,
      t.autoSync,
      t.updatedAt,
      t.id,
    ),
  ],
);

export const googleCalendarOAuthStates = sqliteTable(
  "google_calendar_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    audience: text("audience").notNull(),
    verifierEnvelope: text("verifier_envelope").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    index("google_calendar_state_expiry_idx").on(t.expiresAt),
    index("google_calendar_state_user_idx").on(t.userId),
  ],
);

export const googleCalendarEventLinks = sqliteTable(
  "google_calendar_event_links",
  {
    id: text("id").primaryKey(),
    connectionId: text("connection_id")
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id").references(
      () => practiceAppointments.id,
      { onDelete: "set null" },
    ),
    eventId: text("event_id").notNull(),
    generation: integer("generation").notNull().default(0),
    status: text("status").notNull().default("pending"),
    sourceUpdatedAt: text("source_updated_at"),
    googleReminders: integer("google_reminders", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("google_calendar_event_appointment_idx").on(
      t.connectionId,
      t.appointmentId,
    ),
    uniqueIndex("google_calendar_event_id_idx").on(t.connectionId, t.eventId),
    index("google_calendar_event_cleanup_idx").on(t.connectionId, t.id),
  ],
);
