-- Baseline explícita: citas existentes y nuevas empiezan en 0; no se inventa
-- una revisión a partir de fechas o del histórico de auditoría.
ALTER TABLE practice_appointments ADD COLUMN calendar_revision INTEGER NOT NULL DEFAULT 0
  CONSTRAINT practice_appointments_calendar_revision_valid
  CHECK (typeof(calendar_revision) = 'integer' AND calendar_revision BETWEEN 0 AND 2147483647);
--> statement-breakpoint
-- Todo escritor queda cubierto, incluidos los que confirman solicitudes de
-- paciente. El incremento participa en la misma transacción de la escritura.
-- No-op, consentimiento de llamada, lectura o fallo no consumen revisiones.
CREATE TRIGGER practice_appointments_calendar_revision
AFTER UPDATE OF starts_at, ends_at, status, time_zone ON practice_appointments
WHEN OLD.starts_at IS NOT NEW.starts_at OR OLD.ends_at IS NOT NEW.ends_at
  OR OLD.status IS NOT NEW.status OR OLD.time_zone IS NOT NEW.time_zone
BEGIN
  UPDATE practice_appointments SET calendar_revision = OLD.calendar_revision + 1 WHERE id = NEW.id;
END;
