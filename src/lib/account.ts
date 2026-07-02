import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  account,
  assignments,
  auditLogs,
  conversations,
  professionals,
  responseSamples,
  seekerSessions,
  session,
  user,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

/**
 * Borra por completo y de forma atómica al usuario `userId` y todo su rastro: el
 * perfil profesional (si existe) con sus asignaciones, conversaciones, muestras
 * de respuesta y sesiones de seeker, más las filas de autenticación
 * (session/account/user).
 *
 * No dependemos de `ON DELETE CASCADE`: el driver sqlite-proxy (libSQL local /
 * D1 en prod) no garantiza `PRAGMA foreign_keys = ON`, así que borramos los
 * hijos explícitamente, hijos→padres, en un único `db.batch()` (todo-o-nada).
 *
 * ponytail: no reengancha al pool las help_requests que el pro tuviera
 * "assigned" — es un caso raro (pro aprobado con casos activos que se borra) y
 * quien pide ayuda puede volver a solicitar; replicar el flujo de ofertas sería
 * desproporcionado.
 */
export async function purgeAccount(userId: string): Promise<void> {
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, userId),
    columns: { id: true },
  });

  const professionalDeletes = professional
    ? [
        db
          .delete(responseSamples)
          .where(eq(responseSamples.professionalId, professional.id)),
        db
          .delete(seekerSessions)
          .where(
            inArray(
              seekerSessions.conversationId,
              db
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.professionalId, professional.id)),
            ),
          ),
        db
          .delete(conversations)
          .where(eq(conversations.professionalId, professional.id)),
        db
          .delete(assignments)
          .where(eq(assignments.professionalId, professional.id)),
        db.delete(professionals).where(eq(professionals.id, professional.id)),
      ]
    : [];

  // `session`/`account` (hijos de user) van primero y `user` al final: el batch
  // queda no vacío por sus extremos fijos y el orden es FK-safe (todo hijo antes
  // que su padre). `professionalDeletes` ya va ordenado hijos→padre.
  await db.batch([
    db.delete(session).where(eq(session.userId, userId)),
    db.delete(account).where(eq(account.userId, userId)),
    ...professionalDeletes,
    db.delete(user).where(eq(user.id, userId)),
  ]);
}

/**
 * Repara un registro que quedó a medias: si el alta muere entre crear la fila
 * `user` y guardar la credencial (pasó en producción por el límite de CPU del
 * Worker al hashear con scrypt), la persona queda bloqueada — "ya existe una
 * cuenta" al registrarse y "contraseña incorrecta" al entrar, sin vía de
 * recuperación. Si la cuenta es un huérfano puro (cero credenciales o
 * proveedores, cero sesiones y sin perfil profesional), la borramos para que
 * el registro pueda repetirse limpio. En seguridad equivale a que la fila
 * nunca hubiera existido: no hay nada que un tercero pueda robar o secuestrar
 * que no pudiera obtener registrando ese correo desde cero. Deja rastro en
 * audit_logs.
 */
export async function reclamarUsuarioHuerfano(
  emailCrudo: string,
): Promise<boolean> {
  const email = emailCrudo.trim().toLowerCase();
  if (!email) return false;

  const [fila] = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);
  if (!fila) return false;

  const [credencial] = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.userId, fila.id))
    .limit(1);
  if (credencial) return false;

  const [sesion] = await db
    .select({ id: session.id })
    .from(session)
    .where(eq(session.userId, fila.id))
    .limit(1);
  if (sesion) return false;

  const perfil = await db.query.professionals.findFirst({
    where: eq(professionals.userId, fila.id),
    columns: { id: true },
  });
  if (perfil) return false;

  await db.batch([
    db.delete(user).where(eq(user.id, fila.id)),
    db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: email,
      action: "user_orphan_reclaimed",
      entityType: "user",
      entityId: fila.id,
      createdAt: nowIso(),
    }),
  ]);
  return true;
}
