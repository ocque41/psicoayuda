import "server-only";

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  account,
  assignments,
  auditLogs,
  contactMessages,
  conversations,
  professionals,
  responseSamples,
  seekerSessions,
  session,
  user,
} from "@/db/schema";
import { releaseProfessionalAssignments } from "@/lib/assignment";
import { newId, nowIso } from "@/lib/ids";

/**
 * Borra la cuenta y los datos operativos del usuario `userId`. Antes de borrar
 * un perfil profesional devuelve sus casos activos a la cola y revoca sus
 * chats; después elimina en un batch atómico las filas de la cuenta. Los
 * mensajes enviados al equipo se conservan por la política del buzón, pero se
 * desligan del perfil eliminado.
 *
 * No dependemos de `ON DELETE CASCADE`: el driver sqlite-proxy (libSQL local /
 * D1 en prod) no garantiza `PRAGMA foreign_keys = ON`, así que borramos los
 * hijos explícitamente, hijos→padres, en un único `db.batch()` (todo-o-nada).
 *
 */
export async function purgeAccount(userId: string): Promise<void> {
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, userId),
    columns: { id: true },
  });

  // Nunca dejamos a una persona sin acompañante visible: una baja profesional
  // devuelve sus solicitudes a la cola antes de eliminar el perfil.
  if (professional) {
    await releaseProfessionalAssignments(professional.id);
  }

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
        // Conservamos los mensajes enviados al equipo, pero desligados del
        // perfil borrado. No confiamos solo en ON DELETE SET NULL porque D1
        // puede ejecutar con las claves foráneas desactivadas.
        db
          .update(contactMessages)
          .set({ professionalId: null, updatedAt: nowIso() })
          .where(eq(contactMessages.professionalId, professional.id)),
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
