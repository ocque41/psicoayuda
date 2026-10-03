import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  account,
  assignments,
  auditLogs,
  contactMessages,
  conversations,
  patientAccounts,
  patientConversationLinks,
  professionals,
  responseSamples,
  seekerSessions,
  session,
  user,
} from "@/db/schema";
import { releaseProfessionalAssignments } from "@/lib/assignment";
import {
  calendarAccountDeleteStatements,
  calendarUnlinkProfessionalAppointments,
  prepareCalendarAccountPurge,
} from "@/lib/calendar/purge";
import { purgeConversationMessagesDetailed } from "@/lib/chat-admin";
import { newId, nowIso } from "@/lib/ids";
import {
  patientAccountDeleteStatements,
  patientLinksForProfessionalDeleteStatements,
  preparePatientAccountPurge,
} from "@/lib/patient/purge";
import {
  practiceDeleteStatements,
  preparePracticePurge,
} from "@/lib/practice/purge";

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
  let patientClaimed = false;
  try {
    const patientAccount = await db.query.patientAccounts.findFirst({
      where: eq(patientAccounts.userId, userId),
      columns: { userId: true, deletionState: true },
    });
    if (patientAccount) {
      const links = db
        .select({ id: patientConversationLinks.conversationId })
        .from(patientConversationLinks)
        .where(eq(patientConversationLinks.userId, userId));
      const claimed = await db.batch([
        db
          .update(patientAccounts)
          .set({ deletionState: "deleting" })
          .where(
            and(
              eq(patientAccounts.userId, userId),
              eq(patientAccounts.deletionState, "active"),
            ),
          )
          .returning({ userId: patientAccounts.userId }),
        db
          .update(seekerSessions)
          .set({ revokedAt: new Date() })
          .where(inArray(seekerSessions.conversationId, links)),
      ]);
      if (!claimed[0].length)
        throw new Error(
          "La baja de esta cuenta está en proceso. Reintenta más tarde.",
        );
      patientClaimed = true;
      try {
        await preparePatientAccountPurge(userId);
      } catch (error) {
        await db
          .update(patientAccounts)
          .set({ deletionState: "active" })
          .where(eq(patientAccounts.userId, userId));
        throw error;
      }
    }
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.userId, userId),
      columns: { id: true, status: true },
    });

    // Nunca dejamos a una persona sin acompañante visible: una baja profesional
    // devuelve sus solicitudes a la cola antes de eliminar el perfil.
    if (professional) {
      // Bloquea nuevas operaciones mientras se cancelan proveedores; no pierde
      // una decisión de suspensión del equipo si hay que reintentar la baja.
      const claimed = await db
        .update(professionals)
        .set({ status: "deleting" })
        .where(
          and(
            eq(professionals.id, professional.id),
            eq(professionals.status, professional.status),
          ),
        )
        .returning({ id: professionals.id });
      if (!claimed.length)
        throw new Error("El perfil cambió. Vuelve a intentar la eliminación.");
      try {
        // Ambos roles ya bloquean nuevos grants antes de revocar Calendar.
        await prepareCalendarAccountPurge(userId);
        await preparePracticePurge(professional.id);
      } catch (error) {
        await db
          .update(professionals)
          .set({ status: professional.status })
          .where(
            and(
              eq(professionals.id, professional.id),
              eq(professionals.status, "deleting"),
            ),
          );
        throw error;
      }
      await releaseProfessionalAssignments(professional.id);

      // Los chats se borran de verdad: el espejo D1 se elimina en el batch de
      // abajo, pero el CONTENIDO vive en el Durable Object de cada conversación.
      // Si algún DO falla, conservamos TODAS las referencias D1 y el perfil en
      // deleting. La persona mantiene su sesión para reintentar; los chats ya
      // purgados se pueden vaciar otra vez de forma idempotente.
      const conversationsToPurge = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.professionalId, professional.id));
      let messagesPurgeFailed = false;
      for (const conversation of conversationsToPurge) {
        const purge = await purgeConversationMessagesDetailed(conversation.id);
        if (purge === "failed") {
          messagesPurgeFailed = true;
          await db.insert(auditLogs).values({
            id: newId("log"),
            actorEmail: null,
            action: "account_purge_conversation_failed",
            entityType: "conversation",
            entityId: conversation.id,
            metadata: JSON.stringify({ professionalId: professional.id }),
            createdAt: nowIso(),
          });
        }
      }
      if (messagesPurgeFailed)
        throw new Error(
          "No pudimos completar el borrado de los chats. Conservamos la cuenta para que puedas reintentar la eliminación.",
        );
    } else {
      await prepareCalendarAccountPurge(userId);
    }

    const professionalDeletes = professional
      ? [
          calendarUnlinkProfessionalAppointments(professional.id),
          ...patientLinksForProfessionalDeleteStatements(professional.id),
          ...practiceDeleteStatements(professional.id),
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
      ...calendarAccountDeleteStatements(userId),
      db.delete(account).where(eq(account.userId, userId)),
      ...professionalDeletes,
      ...patientAccountDeleteStatements(userId),
      db.delete(user).where(eq(user.id, userId)),
    ]);
  } catch (error) {
    if (patientClaimed)
      await db
        .update(patientAccounts)
        .set({ deletionState: "active" })
        .where(
          and(
            eq(patientAccounts.userId, userId),
            eq(patientAccounts.deletionState, "deleting"),
          ),
        )
        .catch(() => undefined);
    throw error;
  }
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
  if (
    await db.query.patientAccounts.findFirst({
      where: eq(patientAccounts.userId, fila.id),
      columns: { userId: true },
    })
  )
    return false;

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
