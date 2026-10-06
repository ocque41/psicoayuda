import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { practicePatients, professionals } from "@/db/schema";

/** La ficha ampliada se cifra como un único documento privado. */
export const practicePatientProfiles = sqliteTable(
  "practice_patient_profiles",
  {
    patientId: text("patient_id")
      .primaryKey()
      .notNull()
      .references(() => practicePatients.id, { onDelete: "cascade" }),
    professionalId: text("professional_id")
      .notNull()
      .references(() => professionals.id, { onDelete: "cascade" }),
    contentCiphertext: text("content_ciphertext").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("practice_patient_profiles_owner_idx").on(t.professionalId)],
);
