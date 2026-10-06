-- Aditiva: los contactos, notas por sesión y todos los datos previos se conservan.
-- Reversión: volver al código anterior conservando esta tabla y el cifrado.
-- No cambiar la clave NIDO_NOTES_ENCRYPTION_KEY ni borrar esta tabla al revertir.
CREATE TABLE IF NOT EXISTS practice_patient_profiles (
 patient_id TEXT PRIMARY KEY NOT NULL REFERENCES practice_patients(id) ON DELETE CASCADE,
 professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
 content_ciphertext TEXT NOT NULL CHECK (length(content_ciphertext) > 0),
 revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1 AND typeof(revision) = 'integer'),
 updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_patient_profiles_owner_idx ON practice_patient_profiles(professional_id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_patient_profiles_owner_insert
BEFORE INSERT ON practice_patient_profiles
WHEN NOT EXISTS (
 SELECT 1 FROM practice_patients patient
 WHERE patient.id = NEW.patient_id AND patient.professional_id = NEW.professional_id
)
BEGIN
 SELECT RAISE(ABORT, 'practice_patient_profile_owner');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_patient_profiles_owner_update
BEFORE UPDATE ON practice_patient_profiles
WHEN NEW.patient_id IS NOT OLD.patient_id OR NEW.professional_id IS NOT OLD.professional_id OR NOT EXISTS (
 SELECT 1 FROM practice_patients patient
 WHERE patient.id = NEW.patient_id AND patient.professional_id = NEW.professional_id
)
BEGIN
 SELECT RAISE(ABORT, 'practice_patient_profile_owner');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS practice_patient_profile_parent_owner_update
BEFORE UPDATE OF id, professional_id ON practice_patients
WHEN (NEW.id IS NOT OLD.id OR NEW.professional_id IS NOT OLD.professional_id)
 AND EXISTS (SELECT 1 FROM practice_patient_profiles profile WHERE profile.patient_id = OLD.id)
BEGIN
 SELECT RAISE(ABORT, 'practice_patient_profile_parent_owner');
END;
