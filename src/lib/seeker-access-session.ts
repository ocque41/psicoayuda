import "server-only";
import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getAuthSecret } from "@/lib/auth-secret";
import { newId } from "@/lib/ids";
import { SEEKER_SESSION_TTL_MS } from "@/lib/seeker-access";
import type { SeekerTokenPayload } from "@/lib/seeker-token";

export const SEEKER_ACCESS_EXCHANGES_PER_HOUR = 20;
/** Cada escritura repite permiso, caducidad y estado usando el reloj de DB. */
export async function exchangeSeekerAccess(
  link: SeekerTokenPayload,
  current: SeekerTokenPayload | null,
): Promise<SeekerTokenPayload | null> {
  if (link.purpose === "browser") return null;
  const now = Date.now();
  const sourceRole = link.purpose === "access-link" ? "access-link" : "seeker";
  const permission = sql`EXISTS(SELECT 1 FROM seeker_sessions l JOIN conversations c ON c.id=l.conversation_id
    WHERE l.sid=${link.sid} AND l.conversation_id=${link.conversationId} AND l.role=${sourceRole}
    AND l.revoked_at IS NULL AND l.expires_at > cast(unixepoch('subsecond')*1000 AS integer)
    AND ${link.exp} > cast(unixepoch('subsecond')*1000 AS integer)
    AND c.anonymized_at IS NULL AND c.deleted_at IS NULL AND c.status IN ('open','closed'))`;
  // Un navegador nuevo ya registrado reutiliza su propio SID. Si se revocó
  // durante el request, no se crea otro SID con su respuesta tardía.
  if (
    current?.purpose === "browser" &&
    current.conversationId === link.conversationId
  ) {
    const reused = await db.values<
      [string, number]
    >(sql`UPDATE seeker_sessions SET last_seen_at=${now}
      WHERE sid=${current.sid} AND conversation_id=${link.conversationId} AND role='seeker' AND revoked_at IS NULL
      AND expires_at > cast(unixepoch('subsecond')*1000 AS integer)
      AND ${current.exp} > cast(unixepoch('subsecond')*1000 AS integer) AND ${permission}
      RETURNING sid,expires_at`);
    if (!reused.length) return null;
    return {
      ...current,
      exp: Math.min(current.exp, reused[0][1]),
      purpose: "browser",
    };
  }
  const sid = newId("seek");
  const expiresAt = now + SEEKER_SESSION_TTL_MS;
  // Sin IP ni token guardados. Hash con dominio propio para acotar altas de
  // navegadores por enlace; no coincide con el límite de contactos públicos.
  const sourceHash = createHmac("sha256", getAuthSecret())
    .update(`seeker-access-exchange:${link.sid}`)
    .digest("hex");
  const inserted = await db.values<
    [string]
  >(sql`INSERT INTO seeker_sessions (sid,conversation_id,requester_hash,role,issued_at,expires_at,last_seen_at)
    SELECT ${sid},${link.conversationId},${sourceHash},'seeker',${now},${expiresAt},${now}
    WHERE ${permission} AND ${expiresAt} > cast(unixepoch('subsecond')*1000 AS integer)
    AND (SELECT count(*) FROM seeker_sessions WHERE conversation_id=${link.conversationId} AND requester_hash=${sourceHash}
      AND issued_at >= cast(unixepoch('subsecond')*1000 AS integer)-3600000) < ${SEEKER_ACCESS_EXCHANGES_PER_HOUR}
    RETURNING sid`);
  if (!inserted.length) return null;
  return {
    sid,
    conversationId: link.conversationId,
    helpRequestId: link.helpRequestId,
    role: "seeker",
    purpose: "browser",
    iat: now,
    exp: expiresAt,
  };
}
