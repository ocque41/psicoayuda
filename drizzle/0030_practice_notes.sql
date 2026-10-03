-- Solo tablas nuevas. No modifica ni reemplaza historiales anteriores.
CREATE TABLE IF NOT EXISTS practice_notes (
 id TEXT PRIMARY KEY NOT NULL,
 professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
 patient_id TEXT NOT NULL REFERENCES practice_patients(id) ON DELETE CASCADE,
 ciphertext TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_notes_patient_updated_idx ON practice_notes(patient_id, professional_id, updated_at, id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_notes_owner_insert
BEFORE INSERT ON practice_notes
WHEN NOT EXISTS (SELECT 1 FROM practice_patients WHERE id = NEW.patient_id AND professional_id = NEW.professional_id)
BEGIN
 SELECT RAISE(ABORT, 'practice_note_owner');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_notes_owner_update
BEFORE UPDATE ON practice_notes
WHEN OLD.patient_id != NEW.patient_id OR OLD.professional_id != NEW.professional_id
BEGIN
 SELECT RAISE(ABORT, 'practice_note_owner');
END;
