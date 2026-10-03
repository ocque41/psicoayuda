-- Aditiva: conserva íntegros los recibos y las auditorías existentes.
-- Reversión: mantener esta tabla y usar un lector compatible o solo lectura.
CREATE TABLE practice_receipt_corrections (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_id TEXT NOT NULL REFERENCES practice_receipts(id) ON DELETE CASCADE,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES practice_patients(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  expected_revision INTEGER NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  reference TEXT NOT NULL,
  received_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  author_user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  submission_id TEXT NOT NULL,
  submission_payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX practice_receipt_corrections_revision_idx ON practice_receipt_corrections(receipt_id, revision);
--> statement-breakpoint
CREATE UNIQUE INDEX practice_receipt_corrections_submission_idx ON practice_receipt_corrections(submission_id);
--> statement-breakpoint
CREATE INDEX practice_receipt_corrections_pro_reference_idx ON practice_receipt_corrections(professional_id, reference, receipt_id, revision);
--> statement-breakpoint
CREATE INDEX practice_receipt_corrections_patient_idx ON practice_receipt_corrections(patient_id);
--> statement-breakpoint
CREATE TRIGGER practice_receipt_correction_shape BEFORE INSERT ON practice_receipt_corrections
WHEN NEW.kind NOT IN ('corrected', 'voided')
  OR typeof(NEW.amount_cents) <> 'integer' OR NEW.amount_cents < 0 OR NEW.amount_cents > 99999999
  OR (NEW.kind = 'corrected' AND NEW.amount_cents = 0)
  OR (NEW.kind = 'voided' AND NEW.amount_cents <> 0)
  OR NEW.currency NOT IN ('usd', 'eur', 'ves')
  OR NEW.method NOT IN ('cash', 'pago_movil', 'transfer', 'zelle', 'paypal', 'bizum', 'cashea', 'external_card')
  OR length(trim(NEW.reason)) < 3 OR length(NEW.reason) > 160
  OR length(trim(NEW.reference)) < 3 OR length(NEW.reference) > 300
  OR NEW.author_user_id IS NULL OR length(NEW.submission_id) <> 36
  OR json_valid(NEW.submission_payload) = 0
  OR strftime('%Y-%m-%dT%H:%M:%fZ', NEW.received_at) IS NULL
  OR NEW.received_at <> strftime('%Y-%m-%dT%H:%M:%fZ', NEW.received_at)
  OR julianday(NEW.received_at) > julianday('now')
BEGIN SELECT RAISE(ABORT, 'receipt_correction_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER practice_receipt_correction_owner BEFORE INSERT ON practice_receipt_corrections
WHEN NOT EXISTS (
  SELECT 1 FROM practice_receipts AS receipt
  JOIN practice_patients AS patient ON patient.id = receipt.patient_id AND patient.professional_id = receipt.professional_id
  JOIN professionals AS professional ON professional.id = receipt.professional_id
  JOIN user AS actor ON actor.id = professional.user_id
  WHERE receipt.id = NEW.receipt_id AND receipt.professional_id = NEW.professional_id AND receipt.patient_id = NEW.patient_id
    AND patient.program = 'general' AND professional.status = 'approved'
    AND professional.non_clinical_helper = 0 AND actor.id = NEW.author_user_id
)
BEGIN SELECT RAISE(ABORT, 'receipt_correction_owner'); END;
--> statement-breakpoint
CREATE TRIGGER practice_receipt_correction_revision BEFORE INSERT ON practice_receipt_corrections
WHEN typeof(NEW.revision) <> 'integer' OR typeof(NEW.expected_revision) <> 'integer'
  OR NEW.expected_revision <> coalesce((SELECT max(revision) FROM practice_receipt_corrections WHERE receipt_id = NEW.receipt_id), 0)
  OR NEW.revision <> NEW.expected_revision + 1
BEGIN SELECT RAISE(ABORT, 'receipt_correction_conflict'); END;
--> statement-breakpoint
-- Las referencias originales quedan reservadas por su índice histórico UNIQUE.
-- Las referencias corregidas solo se reservan mientras son la revisión vigente
-- y no está anulada. Ambas entradas se comprueban dentro de la escritura.
CREATE TRIGGER practice_receipt_correction_reference BEFORE INSERT ON practice_receipt_corrections
WHEN NEW.kind <> 'voided' AND (
  EXISTS (SELECT 1 FROM practice_receipts WHERE professional_id = NEW.professional_id AND id <> NEW.receipt_id AND reference = NEW.reference)
  OR EXISTS (
    SELECT 1 FROM practice_receipt_corrections AS correction
    WHERE correction.professional_id = NEW.professional_id AND correction.reference = NEW.reference
      AND correction.receipt_id <> NEW.receipt_id AND correction.kind <> 'voided'
      AND correction.revision = (SELECT max(revision) FROM practice_receipt_corrections WHERE receipt_id = correction.receipt_id)
  )
)
BEGIN SELECT RAISE(ABORT, 'receipt_reference_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER practice_receipt_original_reference BEFORE INSERT ON practice_receipts
WHEN EXISTS (
  SELECT 1 FROM practice_receipt_corrections AS correction
  WHERE correction.professional_id = NEW.professional_id AND correction.reference = NEW.reference
    AND correction.kind <> 'voided'
    AND correction.revision = (SELECT max(revision) FROM practice_receipt_corrections WHERE receipt_id = correction.receipt_id)
)
BEGIN SELECT RAISE(ABORT, 'receipt_reference_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER practice_receipt_original_immutable BEFORE UPDATE ON practice_receipts
BEGIN SELECT RAISE(ABORT, 'receipt_original_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER practice_receipt_correction_immutable BEFORE UPDATE OF id, receipt_id, professional_id, patient_id, revision, expected_revision, kind, amount_cents, currency, method, reference, received_at, reason, submission_id, submission_payload, created_at ON practice_receipt_corrections
BEGIN SELECT RAISE(ABORT, 'receipt_correction_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER practice_receipt_correction_author_immutable BEFORE UPDATE OF author_user_id ON practice_receipt_corrections
WHEN NEW.author_user_id IS NOT OLD.author_user_id AND NOT (
  NEW.author_user_id IS NULL AND OLD.author_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM user WHERE id = OLD.author_user_id)
)
BEGIN SELECT RAISE(ABORT, 'receipt_correction_immutable'); END;
