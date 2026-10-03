-- Aditiva: conserva datos, pagos, conversaciones y cupos existentes.
CREATE TABLE practice_settings (professional_id TEXT PRIMARY KEY NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, time_zone TEXT NOT NULL DEFAULT 'America/Caracas', work_start INTEGER NOT NULL DEFAULT 9, work_end INTEGER NOT NULL DEFAULT 18, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE practice_patients (id TEXT PRIMARY KEY NOT NULL, professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, conversation_id TEXT UNIQUE REFERENCES conversations(id) ON DELETE SET NULL, name TEXT NOT NULL, email TEXT , country TEXT NOT NULL, time_zone TEXT NOT NULL DEFAULT 'America/Caracas', program TEXT NOT NULL DEFAULT 'general', status TEXT NOT NULL DEFAULT 'new', consent_at TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX practice_patients_pro_status_idx ON practice_patients(professional_id,status);
--> statement-breakpoint
CREATE TABLE practice_services (id TEXT PRIMARY KEY NOT NULL, professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, title TEXT NOT NULL, duration_minutes INTEGER NOT NULL, sessions_count INTEGER NOT NULL DEFAULT 1, price_cents INTEGER NOT NULL, currency TEXT NOT NULL, interval TEXT NOT NULL DEFAULT 'one_time', validity_days INTEGER NOT NULL DEFAULT 30, cancellation_hours INTEGER NOT NULL DEFAULT 24, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX practice_services_pro_idx ON practice_services(professional_id);
--> statement-breakpoint
CREATE TABLE practice_appointments (id TEXT PRIMARY KEY NOT NULL, professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, patient_id TEXT NOT NULL REFERENCES practice_patients(id) ON DELETE CASCADE, service_id TEXT REFERENCES practice_services(id) ON DELETE SET NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, time_zone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', modality TEXT NOT NULL DEFAULT 'online', price_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'usd', cancellation_hours INTEGER NOT NULL DEFAULT 24, daily_room TEXT , created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX practice_appointments_pro_date_idx ON practice_appointments(professional_id,starts_at);
--> statement-breakpoint
CREATE INDEX practice_appointments_patient_idx ON practice_appointments(patient_id);
--> statement-breakpoint
CREATE TABLE practice_receipts (id TEXT PRIMARY KEY NOT NULL, professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, patient_id TEXT NOT NULL REFERENCES practice_patients(id) ON DELETE CASCADE, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, method TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, received_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX practice_receipts_patient_idx ON practice_receipts(patient_id);
--> statement-breakpoint
CREATE TABLE professional_memberships (professional_id TEXT PRIMARY KEY NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, trial_started_at TEXT NOT NULL, trial_ends_at TEXT NOT NULL, stripe_customer_id TEXT UNIQUE, stripe_subscription_id TEXT UNIQUE, checkout_id TEXT , status TEXT NOT NULL DEFAULT 'trialing', plan TEXT , updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE practice_credentials (id TEXT PRIMARY KEY NOT NULL, professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, patient_country TEXT NOT NULL, registry_reference TEXT NOT NULL, reviewed_by TEXT NOT NULL, reviewed_at TEXT NOT NULL, expires_at TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX practice_credentials_pro_country_idx ON practice_credentials(professional_id,patient_country);
--> statement-breakpoint
CREATE TRIGGER practice_appointments_no_overlap BEFORE INSERT ON practice_appointments
WHEN NEW.status = 'scheduled' AND EXISTS (SELECT 1 FROM practice_appointments WHERE professional_id = NEW.professional_id AND status = 'scheduled' AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at)
BEGIN SELECT RAISE(ABORT, 'practice_appointment_overlap'); END;
--> statement-breakpoint
CREATE TRIGGER practice_appointments_no_overlap_update BEFORE UPDATE OF starts_at, ends_at, status ON practice_appointments
WHEN NEW.status = 'scheduled' AND EXISTS (SELECT 1 FROM practice_appointments WHERE id != NEW.id AND professional_id = NEW.professional_id AND status = 'scheduled' AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at)
BEGIN SELECT RAISE(ABORT, 'practice_appointment_overlap'); END;
--> statement-breakpoint
CREATE TABLE support_replies (id TEXT PRIMARY KEY NOT NULL, contact_id TEXT NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE, body TEXT NOT NULL, author_email TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX support_replies_contact_idx ON support_replies(contact_id);
--> statement-breakpoint
CREATE TABLE call_consents (id TEXT PRIMARY KEY NOT NULL, appointment_id TEXT NOT NULL REFERENCES practice_appointments(id) ON DELETE CASCADE, role TEXT NOT NULL, recording INTEGER NOT NULL DEFAULT 0, transcription INTEGER NOT NULL DEFAULT 0, policy_version TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX call_consents_appointment_role_idx ON call_consents(appointment_id,role);
--> statement-breakpoint
CREATE TABLE practice_call_rooms (name TEXT PRIMARY KEY NOT NULL, appointment_id TEXT REFERENCES practice_appointments(id) ON DELETE SET NULL, professional_id TEXT REFERENCES professionals(id) ON DELETE SET NULL, expires_at TEXT NOT NULL, purged_at TEXT);
--> statement-breakpoint
CREATE TABLE care_plans (id TEXT PRIMARY KEY NOT NULL, patient_id TEXT NOT NULL REFERENCES practice_patients(id) ON DELETE CASCADE, professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE, service_id TEXT REFERENCES practice_services(id) ON DELETE SET NULL, title TEXT NOT NULL, sessions_count INTEGER NOT NULL, duration_minutes INTEGER NOT NULL, price_cents INTEGER NOT NULL, currency TEXT NOT NULL, interval TEXT NOT NULL, validity_days INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'proposed', stripe_subscription_id TEXT UNIQUE, stripe_customer_id TEXT, checkout_id TEXT, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX care_plans_patient_idx ON care_plans(patient_id);
--> statement-breakpoint
CREATE TABLE care_cycles (id TEXT PRIMARY KEY NOT NULL, care_plan_id TEXT NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE, external_reference TEXT NOT NULL UNIQUE, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, sessions_count INTEGER NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'paid', created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX care_cycles_plan_idx ON care_cycles(care_plan_id);
--> statement-breakpoint
ALTER TABLE practice_appointments ADD care_cycle_id TEXT REFERENCES care_cycles(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE TRIGGER care_cycle_booking_guard BEFORE INSERT ON practice_appointments WHEN NEW.care_cycle_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM care_cycles c JOIN care_plans p ON p.id = c.care_plan_id WHERE c.id = NEW.care_cycle_id AND p.patient_id = NEW.patient_id AND p.professional_id = NEW.professional_id AND c.status = 'paid' AND NEW.starts_at >= c.starts_at AND NEW.starts_at < c.ends_at AND (SELECT count(*) FROM practice_appointments a WHERE a.care_cycle_id = c.id AND a.status != 'cancelled') < c.sessions_count)
BEGIN
  SELECT RAISE(ABORT, 'care_cycle_unavailable');
END;
--> statement-breakpoint
CREATE TRIGGER care_cycle_booking_update_guard BEFORE UPDATE OF starts_at, care_cycle_id, status ON practice_appointments WHEN NEW.care_cycle_id IS NOT NULL AND NEW.status = 'scheduled'
AND NOT EXISTS (SELECT 1 FROM care_cycles c JOIN care_plans p ON p.id = c.care_plan_id WHERE c.id = NEW.care_cycle_id AND p.patient_id = NEW.patient_id AND p.professional_id = NEW.professional_id AND c.status = 'paid' AND NEW.starts_at >= c.starts_at AND NEW.starts_at < c.ends_at AND (SELECT count(*) FROM practice_appointments a WHERE a.id != NEW.id AND a.care_cycle_id = c.id AND a.status != 'cancelled') < c.sessions_count)
BEGIN
  SELECT RAISE(ABORT, 'care_cycle_unavailable');
END;
