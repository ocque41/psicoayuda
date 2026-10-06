import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { professionals } from "./schema";

export const admissionConfiguration = sqliteTable(
  "admission_configuration",
  {
    id: text("id").notNull().primaryKey(),
    stagesJson: text("stages_json").notNull(),
    revision: integer("revision").notNull().default(1),
    lastEventId: text("last_event_id"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    check("admission_configuration_singleton", sql`${t.id} = 'default'`),
    check("admission_configuration_revision", sql`${t.revision} >= 1`),
  ],
);

export const admissionCases = sqliteTable(
  "admission_cases",
  {
    professionalId: text("professional_id")
      .notNull()
      .primaryKey()
      .references(() => professionals.id, { onDelete: "cascade" }),
    stageId: text("stage_id").notNull(),
    profileRevision: text("profile_revision").notNull(),
    identityChecked: integer("identity_checked", { mode: "boolean" })
      .notNull()
      .default(false),
    identityReference: text("identity_reference").notNull().default(""),
    credentialsChecked: integer("credentials_checked", { mode: "boolean" })
      .notNull()
      .default(false),
    credentialsReference: text("credentials_reference").notNull().default(""),
    interviewAt: text("interview_at"),
    interviewTimeZone: text("interview_time_zone").notNull().default("UTC"),
    interviewReference: text("interview_reference").notNull().default(""),
    interviewCompleted: integer("interview_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    revision: integer("revision").notNull().default(1),
    configRevision: integer("config_revision").notNull(),
    lastEventId: text("last_event_id").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("admission_cases_stage_updated_idx").on(
      t.stageId,
      t.updatedAt,
      t.professionalId,
    ),
    check("admission_cases_revision", sql`${t.revision} >= 1`),
    check(
      "admission_identity_evidence",
      sql`${t.identityChecked} = 0 OR length(trim(${t.identityReference})) >= 5`,
    ),
    check(
      "admission_credentials_evidence",
      sql`${t.credentialsChecked} = 0 OR length(trim(${t.credentialsReference})) >= 5`,
    ),
    check(
      "admission_interview_evidence",
      sql`${t.interviewCompleted} = 0 OR (${t.interviewAt} IS NOT NULL AND length(trim(${t.interviewReference})) >= 5)`,
    ),
  ],
);

export const admissionEvents = sqliteTable(
  "admission_events",
  {
    id: text("id").notNull().primaryKey(),
    professionalId: text("professional_id").references(() => professionals.id, {
      onDelete: "cascade",
    }),
    revision: integer("revision").notNull(),
    configRevision: integer("config_revision").notNull(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("admission_events_candidate_revision_idx").on(
      t.professionalId,
      t.revision,
    ),
    index("admission_events_history_idx").on(
      t.professionalId,
      t.createdAt,
      t.id,
    ),
    check("admission_events_revision", sql`${t.revision} >= 1`),
  ],
);
