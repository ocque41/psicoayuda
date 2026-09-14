"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, professionals, recoveryKeystores } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import { isValidPublicKey } from "@/shared/e2ee";

const KEYSTORE_MAX_LENGTH = 262_144;
const KEYSTORE_SAVES_PER_HOUR = 300;
const RECOVERY_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/**
 * Publica la clave pública ECDH del profesional (la privada vive SOLO en su
 * navegador). Sin esta clave, la persona no puede cifrar mensajes para él, así
 * que su sala queda en modo "falta configurar el cifrado" hasta que la suba.
 * Idempotente: cada dispositivo con la misma identidad sube la misma clave.
 */
export async function publishProIdentityKey(
  publicKey: string,
): Promise<{ ok: boolean }> {
  if (!isValidPublicKey(publicKey)) return { ok: false };
  const session = await getServerSession();
  if (!session?.user?.id) return { ok: false };

  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });
  if (!pro || pro.status === "suspended") return { ok: false };

  await db
    .update(professionals)
    .set({
      cryptoPublicKey: publicKey,
      cryptoPublicKeyUpdatedAt: new Date(),
      updatedAt: nowIso(),
    })
    .where(eq(professionals.id, pro.id));
  return { ok: true };
}

/**
 * Guarda (o actualiza) el keystore de recuperación cifrado. El servidor no
 * puede descifrarlo: `id` deriva del código de recuperación y `wrapped` va
 * cifrado con AES-256-GCM bajo una clave derivada de ese código. Se permite sin
 * sesión porque las personas ayudadas no tienen cuenta; el id de 128 bits es
 * inalcanzable sin el código. Un tope global por hora evita abusar de la tabla.
 */
export async function saveRecoveryKeystore(
  id: string,
  wrapped: string,
  kind: "professional" | "seeker",
): Promise<{ ok: boolean }> {
  if (!RECOVERY_ID_PATTERN.test(id)) return { ok: false };
  if (
    typeof wrapped !== "string" ||
    !wrapped.startsWith("v1.") ||
    wrapped.length < 24 ||
    wrapped.length > KEYSTORE_MAX_LENGTH
  ) {
    return { ok: false };
  }
  if (kind !== "professional" && kind !== "seeker") return { ok: false };

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.action, "recovery_keystore_saved"),
        gt(auditLogs.createdAt, since),
      ),
    );
  if (Number(recent[0]?.count ?? 0) >= KEYSTORE_SAVES_PER_HOUR) {
    return { ok: false };
  }

  const timestamp = nowIso();
  await db
    .insert(recoveryKeystores)
    .values({ id, wrapped, kind, createdAt: timestamp, updatedAt: timestamp })
    .onConflictDoUpdate({
      target: recoveryKeystores.id,
      set: { wrapped, kind, updatedAt: timestamp },
    });

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: null,
    action: "recovery_keystore_saved",
    entityType: "recovery_keystore",
    entityId: id,
    createdAt: timestamp,
  });
  return { ok: true };
}

/**
 * Devuelve el keystore cifrado para restaurarlo en otro dispositivo. Sin el
 * código de recuperación el blob es inútil; el id solo se puede calcular desde
 * ese código.
 */
export async function loadRecoveryKeystore(
  id: string,
): Promise<{ wrapped: string } | null> {
  if (!RECOVERY_ID_PATTERN.test(id)) return null;
  const row = await db.query.recoveryKeystores.findFirst({
    where: eq(recoveryKeystores.id, id),
  });
  return row ? { wrapped: row.wrapped } : null;
}
