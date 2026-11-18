-- Aditiva: cuestionario clínico de admisión y plan de acceso del software.
-- No modifica ni borra filas existentes. Todos los perfiles actuales quedan en
-- access_plan='legacy' (acceso sin suscripción) hasta que el equipo los pase
-- expresamente al plan de suscripción desde /admin/planes.
-- Reversión segura: ocultar /pro/cuestionario y /admin/planes; las columnas y
-- la tabla se conservan sin uso.
CREATE TABLE IF NOT EXISTS professional_screenings (
  professional_id TEXT PRIMARY KEY NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '{}',
  exclusions TEXT NOT NULL DEFAULT '',
  score INTEGER,
  max_score INTEGER,
  flags_json TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN access_plan TEXT NOT NULL DEFAULT 'legacy';
--> statement-breakpoint
ALTER TABLE professionals ADD COLUMN access_plan_changed_at TEXT;
--> statement-breakpoint
ALTER TABLE professional_memberships ADD COLUMN currency TEXT;
