-- Aditiva: crea un recorrido independiente para candidatos clínicos pendientes.
-- No modifica perfiles, aprobaciones, solicitudes ni credenciales existentes.
-- Reversión segura: desactivar el rol exclusivo y ocultar la ruta, conservando
-- estas tablas y su historial; no borrar registros ni retirar restricciones.
CREATE TABLE admission_configuration (
 id TEXT PRIMARY KEY NOT NULL CHECK(id='default'),
 stages_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 last_event_id TEXT,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE admission_cases (
 professional_id TEXT PRIMARY KEY NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
 stage_id TEXT NOT NULL,
 profile_revision TEXT NOT NULL,
 identity_checked INTEGER NOT NULL DEFAULT 0 CHECK(identity_checked IN(0,1)),
 identity_reference TEXT NOT NULL DEFAULT '',
 credentials_checked INTEGER NOT NULL DEFAULT 0 CHECK(credentials_checked IN(0,1)),
 credentials_reference TEXT NOT NULL DEFAULT '',
 interview_at TEXT,
 interview_time_zone TEXT NOT NULL DEFAULT 'UTC',
 interview_reference TEXT NOT NULL DEFAULT '',
 interview_completed INTEGER NOT NULL DEFAULT 0 CHECK(interview_completed IN(0,1)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
 config_revision INTEGER NOT NULL,
 last_event_id TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 CHECK(identity_checked=0 OR length(trim(identity_reference))>=5),
 CHECK(credentials_checked=0 OR length(trim(credentials_reference))>=5),
 CHECK(interview_completed=0 OR (interview_at IS NOT NULL AND length(trim(interview_reference))>=5))
);
--> statement-breakpoint
CREATE INDEX admission_cases_stage_updated_idx ON admission_cases(stage_id,updated_at,professional_id);
--> statement-breakpoint
CREATE TABLE admission_events (
 id TEXT PRIMARY KEY NOT NULL,
 professional_id TEXT REFERENCES professionals(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>=1),
 config_revision INTEGER NOT NULL,
 actor_user_id TEXT NOT NULL,
 action TEXT NOT NULL,
 summary TEXT NOT NULL,
 metadata TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX admission_events_candidate_revision_idx ON admission_events(professional_id,revision);
--> statement-breakpoint
CREATE INDEX admission_events_history_idx ON admission_events(professional_id,created_at,id);
--> statement-breakpoint
INSERT INTO admission_configuration(id,stages_json,revision,updated_at) VALUES(
 'default',
 '[{"id":"identity","label":"Identidad","core":true},{"id":"credentials","label":"Credenciales","core":true},{"id":"scope","label":"País y ámbitos","core":true},{"id":"interview","label":"Entrevista","core":true},{"id":"publication","label":"Revisión y publicación","core":true}]',
 1,strftime('%Y-%m-%dT%H:%M:%fZ','now')
);
--> statement-breakpoint
CREATE TRIGGER admission_candidate_insert
BEFORE INSERT ON admission_cases
WHEN NOT EXISTS(SELECT 1 FROM professionals WHERE id=NEW.professional_id AND status='pending_verification' AND non_clinical_helper=0)
BEGIN SELECT RAISE(ABORT,'admission_pending_candidate'); END;
--> statement-breakpoint
CREATE TRIGGER admission_candidate_update
BEFORE UPDATE ON admission_cases
WHEN NEW.professional_id IS NOT OLD.professional_id OR NEW.revision <> OLD.revision+1
 OR NOT EXISTS(SELECT 1 FROM professionals WHERE id=NEW.professional_id AND status='pending_verification' AND non_clinical_helper=0)
BEGIN SELECT RAISE(ABORT,'admission_candidate_revision'); END;
--> statement-breakpoint
CREATE TRIGGER admission_events_immutable
BEFORE UPDATE ON admission_events
BEGIN SELECT RAISE(ABORT,'admission_event_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER admission_configuration_revision
BEFORE UPDATE ON admission_configuration
WHEN NEW.id IS NOT OLD.id OR NEW.revision <> OLD.revision+1
BEGIN SELECT RAISE(ABORT,'admission_configuration_revision'); END;
