import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { practiceAppointments, user } from "./schema";

/** Opt-in separado por espacio. No se crean filas al consultar ni al migrar. */
export const appointmentReminderPreferences = sqliteTable(
  "appointment_reminder_preferences",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["professional", "patient"] }).notNull(),
    emailEnabled: integer("email_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    offsetsJson: text("offsets_json").notNull().default("[1440]"),
    timeZone: text("time_zone").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role] }),
    index("reminder_preferences_enabled_idx").on(
      t.emailEnabled,
      t.role,
      t.userId,
    ),
    check(
      "reminder_preferences_role_check",
      sql`${t.role} IN ('professional','patient')`,
    ),
    check("reminder_preferences_revision_check", sql`${t.revision} >= 1`),
    check(
      "reminder_preferences_offsets_check",
      sql`json_valid(${t.offsetsJson}) AND json_type(${t.offsetsJson}) = 'array' AND json_array_length(${t.offsetsJson}) BETWEEN 1 AND 3`,
    ),
  ],
);

/** Ledger operacional sin correo, nombres, notas ni contenido del mensaje. */
export const appointmentReminderDeliveries = sqliteTable(
  "appointment_reminder_deliveries",
  {
    id: text("id").notNull().primaryKey(),
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => practiceAppointments.id, { onDelete: "cascade" }),
    appointmentStartsAt: text("appointment_starts_at").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["professional", "patient"] }).notNull(),
    offsetMinutes: integer("offset_minutes").notNull(),
    preferenceRevision: integer("preference_revision").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    timeZone: text("time_zone").notNull(),
    dueAt: integer("due_at").notNull(),
    status: text("status", {
      enum: ["pending", "sending", "sent", "skipped", "dead"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    firstAttemptAt: integer("first_attempt_at"),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    leaseUntil: integer("lease_until"),
    claimToken: text("claim_token"),
    reasonCode: text("reason_code"),
    sentAt: integer("sent_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("reminder_deliveries_once_idx").on(
      t.appointmentId,
      t.appointmentStartsAt,
      t.userId,
      t.role,
      t.offsetMinutes,
    ),
    index("reminder_deliveries_pending_idx").on(
      t.status,
      t.nextAttemptAt,
      t.id,
    ),
    index("reminder_deliveries_lease_idx").on(t.status, t.leaseUntil, t.id),
    index("reminder_deliveries_user_idx").on(t.userId, t.role),
    index("reminder_deliveries_appointment_idx").on(t.appointmentId),
    check(
      "reminder_deliveries_role_check",
      sql`${t.role} IN ('professional','patient')`,
    ),
    check(
      "reminder_deliveries_status_check",
      sql`${t.status} IN ('pending','sending','sent','skipped','dead')`,
    ),
    check(
      "reminder_deliveries_attempts_check",
      sql`${t.attempts} BETWEEN 0 AND 4`,
    ),
    check(
      "reminder_deliveries_offset_check",
      sql`${t.offsetMinutes} IN (15,30,60,120,360,720,1440,2880,10080)`,
    ),
  ],
);
