CREATE TABLE appointment_reminder_preferences (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('professional','patient')),
  email_enabled INTEGER NOT NULL DEFAULT 0 CHECK(email_enabled IN (0,1)),
  offsets_json TEXT NOT NULL DEFAULT '[1440]' CHECK(json_valid(offsets_json) AND json_type(offsets_json)='array' AND json_array_length(offsets_json) BETWEEN 1 AND 3),
  time_zone TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,role)
);
--> statement-breakpoint
CREATE INDEX reminder_preferences_enabled_idx ON appointment_reminder_preferences(email_enabled,role,user_id);
--> statement-breakpoint
CREATE TABLE appointment_reminder_deliveries (
  id TEXT NOT NULL PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES practice_appointments(id) ON DELETE CASCADE,
  appointment_starts_at TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('professional','patient')),
  offset_minutes INTEGER NOT NULL CHECK(offset_minutes IN (15,30,60,120,360,720,1440,2880,10080)),
  preference_revision INTEGER NOT NULL,
  recipient_hash TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  due_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','skipped','dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),
  first_attempt_at INTEGER,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER,
  claim_token TEXT,
  reason_code TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX reminder_deliveries_once_idx ON appointment_reminder_deliveries(appointment_id,appointment_starts_at,user_id,role,offset_minutes);
--> statement-breakpoint
CREATE INDEX reminder_deliveries_pending_idx ON appointment_reminder_deliveries(status,next_attempt_at,id);
--> statement-breakpoint
CREATE INDEX reminder_deliveries_lease_idx ON appointment_reminder_deliveries(status,lease_until,id);
--> statement-breakpoint
CREATE INDEX reminder_deliveries_user_idx ON appointment_reminder_deliveries(user_id,role);
--> statement-breakpoint
CREATE INDEX reminder_deliveries_appointment_idx ON appointment_reminder_deliveries(appointment_id);
--> statement-breakpoint
CREATE INDEX practice_appointments_reminder_scan_idx ON practice_appointments(status,starts_at,id);
