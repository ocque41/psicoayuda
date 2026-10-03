import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  practiceAppointments,
  practicePatients,
  professionals,
} from "@/db/schema";

export const practiceNotes = sqliteTable(
  "practice_notes",
  {
    id: text("id").primaryKey().notNull(),
    professionalId: text("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    patientId: text("patient_id")
      .notNull()
      .references(() => practicePatients.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id").references(
      () => practiceAppointments.id,
      {
        onDelete: "restrict",
      },
    ),
    ciphertext: text("ciphertext").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("practice_notes_appointment_idx").on(
      t.appointmentId,
      t.professionalId,
      t.patientId,
    ),
    index("practice_notes_patient_updated_idx").on(
      t.patientId,
      t.professionalId,
      t.updatedAt,
      t.id,
    ),
  ],
);
