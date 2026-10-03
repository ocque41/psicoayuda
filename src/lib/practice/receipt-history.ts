import "server-only";
import { sql } from "drizzle-orm";

// Mantener la referencia externa cualificada: Drizzle elimina prefijos de
// columnas interpoladas en la selección de una sola tabla. El índice
// audit_logs_entity_idx acota esta búsqueda a cada recibo de la página.
export const receiptRecordedAt = sql<
  string | null
>`(SELECT min(created_at) FROM audit_logs WHERE entity_type = 'practice' AND entity_id = practice_receipts.id AND action = 'external_receipt_confirmed')`;
