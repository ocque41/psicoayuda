import "server-only";
import { sql } from "drizzle-orm";

/** El guard de entrada mejora el mensaje; la escritura decide con el actor vivo. */
export function currentPracticeActor(professionalId: string, userId: string) {
  return sql`EXISTS (SELECT 1 FROM professionals actor JOIN user account ON account.id=actor.user_id
    WHERE actor.id=${professionalId} AND actor.user_id=${userId}
      AND actor.status='approved' AND coalesce(actor.non_clinical_helper,0)=0)`;
}

/** Una escritura CAS avanza aun si dos operaciones comparten el milisegundo. */
export function nextPracticeTimestamp(previous?: string | null) {
  const prior = Date.parse(previous || "");
  return new Date(
    Math.max(Date.now(), Number.isFinite(prior) ? prior + 1 : 0),
  ).toISOString();
}
