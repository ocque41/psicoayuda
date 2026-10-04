import "server-only";

import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { waitlistEntries } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { WAITLIST_LIMIT_PER_HOUR, type WaitlistSource } from "@/lib/waitlist";

export type StoreWaitlistResult =
  | { ok: true; created: boolean; id: string }
  | { ok: false; reason: "rate_limited" | "error" };

/** Inserción atómica y limitada. Un correo público no prueba propiedad:
 * repetir no modifica relato, estado, conversación ni datos de una fila previa. */
export async function storeWaitlistEntry(input: {
  email: string;
  title: string;
  description: string;
  source: WaitlistSource;
  conversationId?: string | null;
  requesterHash?: string;
  authorization?: SQL;
}): Promise<StoreWaitlistResult> {
  const id = newId("waitlist");
  const timestamp = nowIso();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const requesterHash = input.requesterHash ?? null;
  const rateCondition = requesterHash
    ? sql`(email = ${input.email} OR requester_hash = ${requesterHash})`
    : sql`email = ${input.email}`;

  try {
    // El driver devuelve las filas de RETURNING como arrays posicionales (igual
    // en D1 con `raw()` y en local con libSQL): [id, created_at].
    const rows = (await db.all(sql`
      INSERT INTO waitlist_entries (
        id, email, title, description, source, conversation_id, status,
        requester_hash, created_at, updated_at
      )
      SELECT
        ${id}, ${input.email}, ${input.title}, ${input.description},
        ${input.source}, ${input.conversationId ?? null}, 'waiting',
        ${requesterHash}, ${timestamp}, ${timestamp}
      WHERE ${input.authorization ?? sql`1`} AND (
        SELECT COUNT(*)
        FROM waitlist_entries
        WHERE ${rateCondition} AND created_at >= ${since}
      ) < ${WAITLIST_LIMIT_PER_HOUR}
      ON CONFLICT(email) DO UPDATE SET
        updated_at = waitlist_entries.updated_at
      RETURNING id, created_at
    `)) as string[][];

    if (rows.length === 0) return { ok: false, reason: "rate_limited" };

    return {
      ok: true,
      created: rows[0]?.[0] === id,
      id: String(rows[0]?.[0] ?? id),
    };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/**
 * Anotación vigente nacida de una conversación (para que la tarjeta muestre si
 * la persona ya dejó su correo). Devuelve null si no hay o fue anonimizada.
 */
export async function getWaitlistSignupForConversation(conversationId: string) {
  const row = await db.query.waitlistEntries.findFirst({
    where: and(
      eq(waitlistEntries.conversationId, conversationId),
      isNull(waitlistEntries.anonymizedAt),
    ),
    columns: { email: true, createdAt: true },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  return row ? { email: row.email, createdAt: row.createdAt } : null;
}
