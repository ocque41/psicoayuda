import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { waitlistEntries } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { WAITLIST_LIMIT_PER_HOUR, type WaitlistSource } from "@/lib/waitlist";

export type StoreWaitlistResult =
  | { ok: true; created: boolean; id: string }
  | { ok: false; reason: "rate_limited" | "error" };

/**
 * Guarda (o actualiza) una anotación de la lista de espera. Compartido por el
 * formulario público y por la tarjeta del chat: la verificación del límite y la
 * escritura viven en UNA sola sentencia SQLite, así que D1 serializa la
 * escritura y varios envíos paralelos no pueden pasar todos por un conteo
 * antiguo. UNA fila por correo (`ON CONFLICT`): reenviar actualiza la anotación
 * en vez de duplicarla. `created` distingue el alta de la actualización para que
 * quien llama decida si dispara avisos.
 */
export async function storeWaitlistEntry(input: {
  email: string;
  title: string;
  description: string;
  source: WaitlistSource;
  conversationId?: string | null;
  requesterHash?: string;
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
      WHERE (
        SELECT COUNT(*)
        FROM waitlist_entries
        WHERE ${rateCondition} AND created_at >= ${since}
      ) < ${WAITLIST_LIMIT_PER_HOUR}
      ON CONFLICT(email) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        source = excluded.source,
        conversation_id = COALESCE(
          excluded.conversation_id, waitlist_entries.conversation_id
        ),
        status = CASE
          WHEN waitlist_entries.status = 'closed' THEN 'waiting'
          ELSE waitlist_entries.status
        END,
        updated_at = excluded.updated_at,
        requester_hash = COALESCE(
          excluded.requester_hash, waitlist_entries.requester_hash
        )
      RETURNING id, created_at
    `)) as string[][];

    if (rows.length === 0) return { ok: false, reason: "rate_limited" };

    return {
      ok: true,
      created: rows[0]?.[1] === timestamp,
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
