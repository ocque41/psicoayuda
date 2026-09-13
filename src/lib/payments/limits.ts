import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

// Anti-abuso del checkout PÚBLICO: crear una sesión de Stripe por clic es una
// acción externa que no debe poder dispararse en bucle ni desde bots. El límite
// se respalda en D1 (`audit_logs`), no en memoria del isolate: sobrevive a
// reinicios y es exacto entre instancias. El actor es un hash irreversible de la
// IP (nunca la IP en claro).
export const CHECKOUT_RATE_LIMIT_PER_HOUR = 15;
const CHECKOUT_RATE_WINDOW_MS = 60 * 60 * 1000;

export async function isCheckoutRateLimited(
  requesterHash: string | undefined,
): Promise<boolean> {
  if (!requesterHash) return false;
  const since = new Date(Date.now() - CHECKOUT_RATE_WINDOW_MS).toISOString();
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.actorEmail, requesterHash),
        eq(auditLogs.action, "payment_checkout_created"),
        gte(auditLogs.createdAt, since),
      ),
    );
  return Number(row?.total ?? 0) >= CHECKOUT_RATE_LIMIT_PER_HOUR;
}

/**
 * Registra el INTENTO de checkout (antes de llamar a Stripe): así también
 * cuentan los intentos fallidos y el límite frena bucles aunque creen error.
 */
export async function logCheckoutAttempt(
  requesterHash: string | undefined,
  packageId: string,
): Promise<void> {
  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: requesterHash ?? null,
    action: "payment_checkout_created",
    entityType: "package",
    entityId: packageId,
    createdAt: nowIso(),
  });
}
