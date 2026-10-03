-- Solo índices: no cambia ni elimina registros existentes.
CREATE INDEX IF NOT EXISTS practice_patients_pro_updated_idx ON practice_patients(professional_id, updated_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_appointments_patient_date_idx ON practice_appointments(patient_id, starts_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_appointments_cycle_idx ON practice_appointments(care_cycle_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_receipts_pro_date_idx ON practice_receipts(professional_id, received_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_receipts_patient_date_idx ON practice_receipts(patient_id, received_at, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS practice_call_rooms_retention_idx ON practice_call_rooms(purged_at, expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS care_plans_patient_created_idx ON care_plans(patient_id, created_at, id);
