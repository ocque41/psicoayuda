import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { professionals } from "./schema";

/**
 * Cuestionario clínico de admisión. Una fila por candidatura clínica. Las
 * respuestas guardan identificadores de opción (no letras), porque el orden de
 * las opciones se baraja por candidato. La puntuación y las alertas se calculan
 * en el servidor al enviar y solo las ve el equipo de admisión.
 */
export const professionalScreenings = sqliteTable("professional_screenings", {
  professionalId: text("professional_id")
    .primaryKey()
    .references(() => professionals.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  answersJson: text("answers_json").notNull().default("{}"),
  exclusions: text("exclusions").notNull().default(""),
  score: integer("score"),
  maxScore: integer("max_score"),
  flagsJson: text("flags_json").notNull().default("[]"),
  submittedAt: text("submitted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
