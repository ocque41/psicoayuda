import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { conversations, practiceAppointments, user } from "./schema";

/** Cuenta de organización del paciente; no es una historia clínica. */
export const patientAccounts = sqliteTable("patient_accounts", {
  userId: text("user_id")
    .notNull()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  country: text("country").notNull().default(""),
  timezone: text("timezone").notNull().default("America/Caracas"),
  preferredLanguage: text("preferred_language").notNull().default("es"),
  ageBand: text("age_band").notNull().default("adult"),
  onboardingCompletedAt: text("onboarding_completed_at"),
  deletionState: text("deletion_state").notNull().default("active"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Solo se inserta tras verificar el correo o una sesión firmada registrada. */
export const patientConversationLinks = sqliteTable(
  "patient_conversation_links",
  {
    conversationId: text("conversation_id")
      .notNull()
      .primaryKey()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verifiedBy: text("verified_by").notNull(),
    verifiedAt: text("verified_at").notNull(),
    lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("patient_links_user_idx").on(t.userId, t.verifiedAt)],
);

export const accountRolePreferences = sqliteTable("account_role_preferences", {
  userId: text("user_id")
    .notNull()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const accountOnboardingDrafts = sqliteTable(
  "account_onboarding_drafts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    answersJson: text("answers_json").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.role] }),
    index("account_drafts_expiry_idx").on(t.expiresAt),
  ],
);

/** Solicitud operativa. La confirmación y las condiciones corresponden al profesional. */
export const patientSessionRequests = sqliteTable(
  "patient_session_requests",
  {
    id: text("id").notNull().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id").references(
      () => practiceAppointments.id,
      { onDelete: "cascade" },
    ),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    preferredStartsAt: text("preferred_starts_at"),
    timezone: text("timezone").notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("patient_requests_user_date_idx").on(t.userId, t.createdAt),
    index("patient_requests_chat_status_idx").on(t.conversationId, t.status),
    uniqueIndex("patient_requests_appointment_pending_idx")
      .on(t.appointmentId)
      .where(sql`${t.status} = 'pending'`),
  ],
);
