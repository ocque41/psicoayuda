-- Aditiva: las notas existentes conservan ciphertext, revisión y asociación NULL.
-- Reversión: conservar columna, índices y notas. El código antiguo no crea notas
-- nuevas sin sesión: el trigger las rechaza. Recuperar mediante una corrección
-- hacia delante compatible con sesiones; no quitar las restricciones ni recifrar.
ALTER TABLE practice_notes ADD COLUMN appointment_id TEXT REFERENCES practice_appointments(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_notes_appointment_idx ON practice_notes(appointment_id, professional_id, patient_id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_notes_session_insert
BEFORE INSERT ON practice_notes
WHEN NEW.appointment_id IS NULL OR NOT EXISTS (
 SELECT 1 FROM practice_appointments
 WHERE id = NEW.appointment_id AND professional_id = NEW.professional_id AND patient_id = NEW.patient_id
)
BEGIN
 SELECT RAISE(ABORT, 'practice_note_session');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_notes_session_update
BEFORE UPDATE ON practice_notes
WHEN NEW.appointment_id IS NOT OLD.appointment_id OR (
 NEW.appointment_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM practice_appointments
  WHERE id = NEW.appointment_id AND professional_id = NEW.professional_id AND patient_id = NEW.patient_id
 )
)
BEGIN
 SELECT RAISE(ABORT, 'practice_note_session');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_notes_session_owner_update
BEFORE UPDATE OF id, professional_id, patient_id ON practice_appointments
WHEN (NEW.id IS NOT OLD.id OR NEW.professional_id IS NOT OLD.professional_id OR NEW.patient_id IS NOT OLD.patient_id)
 AND EXISTS (SELECT 1 FROM practice_notes WHERE appointment_id = OLD.id)
BEGIN
 SELECT RAISE(ABORT, 'practice_note_session_owner');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_notes_session_delete_guard
BEFORE DELETE ON practice_appointments
WHEN EXISTS (SELECT 1 FROM practice_notes WHERE appointment_id = OLD.id)
BEGIN
 SELECT RAISE(ABORT, 'practice_note_session_has_notes');
END;
