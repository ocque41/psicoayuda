-- No destructiva: no modifica ni borra filas. Permite notas de la historia
-- clínica general (appointment_id NULL) en una ficha propia, también de
-- pacientes atendidos fuera de Nido. Las notas de sesión siguen exigiendo una
-- sesión del mismo profesional y paciente; practice_notes_owner_insert (0030)
-- sigue exigiendo la ficha propia y practice_notes_session_update (0036) sigue
-- impidiendo mover una nota entre sesión e historia general.
-- Reversión: recrear practice_notes_session_insert tal como está en 0036.
DROP TRIGGER IF EXISTS practice_notes_session_insert;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_notes_session_insert
BEFORE INSERT ON practice_notes
WHEN NEW.appointment_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM practice_appointments
 WHERE id = NEW.appointment_id AND professional_id = NEW.professional_id AND patient_id = NEW.patient_id
)
BEGIN
 SELECT RAISE(ABORT, 'practice_note_session');
END;
