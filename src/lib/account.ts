import "server-only";

import {
  and,
  eq,
  inArray,
  isNull,
  or,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
import {
  type AccountDeletionActor,
  type AccountDeletionIntent,
  accountDeletionAuthority,
  accountDeletionIntentGuard,
  accountRoomsMatch,
  accountRoomsSnapshot,
  closeAccountAssignments,
} from "@/lib/assignment";
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
import { pushAccountDeleteStatements } from "@/lib/push/preferences";

/**
 * Borra la cuenta y los datos operativos del usuario `userId`. Antes de borrar
 * un perfil profesional confirma una intención autenticada de baja, marca
 * deleting y retira sus grants antes de proveedores. El cierre/liberación y
 * el borrado operativo se reclaman después en batches propios con CAS fresco. Los
 * mensajes enviados al equipo se conservan por la política del buzón, pero se
 * desligan del perfil eliminado.
 *
 * No dependemos de `ON DELETE CASCADE`: el driver sqlite-proxy (libSQL local /
 * D1 en prod) no garantiza `PRAGMA foreign_keys = ON`, así que borramos los
 * hijos explícitamente, hijos→padres, en un único `db.batch()` (todo-o-nada).
 *
 */
export async function purgeAccount(
  userId: string,
  actor?: AccountDeletionActor,
): Promise<void> {
  let patientClaimed = false;
  let intent: AccountDeletionIntent | undefined;
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, userId),
  });
  let lockedProfessional = professional;
  let purgeRooms: Awaited<ReturnType<typeof accountRoomsSnapshot>> = [];

  try {
    const patientAccount = await db.query.patientAccounts.findFirst({
      where: eq(patientAccounts.userId, userId),
      columns: { userId: true, deletionState: true },
    });
    if (professional) {
      if (
        patientAccount?.deletionState === "deleting" &&
        professional.status !== "deleting"
      )
        throw new Error(
          "La baja de esta cuenta está en proceso. Reintenta más tarde.",
        );
      if (!actor)
        throw new Error("Tu sesión cambió. Vuelve a intentar la eliminación.");
      const target = await db.query.user.findFirst({
        where: eq(user.id, userId),
      });
      if (!target)
        throw new Error("La cuenta cambió. Vuelve a intentar la eliminación.");
      intent = {
        actor,
        targetUserId: userId,
        targetEmail: target.email.toLowerCase(),
        auditId: newId("log"),
      };
      const lockedAt = new Date(
        Math.max(Date.now(), Date.parse(professional.updatedAt) + 1),
      ).toISOString();
      const admitted = sql`EXISTS (SELECT 1 FROM ${auditLogs} WHERE ${auditLogs.id}=${intent.auditId})`;
      const guards = and(
        accountDeletionAuthority(actor, userId, intent.targetEmail),
        eq(professionals.id, professional.id),
        eq(professionals.userId, userId),
        eq(professionals.status, professional.status),
        eq(professionals.updatedAt, professional.updatedAt),
        eq(
          professionals.currentActiveRequests,
          professional.currentActiveRequests,
        ),
        patientAccount
          ? sql`EXISTS (SELECT 1 FROM ${patientAccounts} WHERE ${patientAccounts.userId}=${userId}
          AND ${patientAccounts.deletionState}=${patientAccount.deletionState})`
          : sql`NOT EXISTS (SELECT 1 FROM ${patientAccounts} WHERE ${patientAccounts.userId}=${userId})`,
      );
      const claim = db
        .insert(auditLogs)
        .select(sql`SELECT ${intent.auditId},${actor.email},
        'account_deletion_started','user',${userId},${JSON.stringify({ kind: actor.kind, professionalId: professional.id })},${lockedAt}
        FROM ${professionals} WHERE ${guards}`)
        .returning({ id: auditLogs.id });
      const ownedRooms = db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.professionalId, professional.id));
      const patientRooms = db
        .select({ id: patientConversationLinks.conversationId })
        .from(patientConversationLinks)
        .where(eq(patientConversationLinks.userId, userId));
      const writes: [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]] = [
        claim,
        db
          .update(professionals)
          .set({
            status: "deleting",
            acceptingRequests: false,
            updatedAt: lockedAt,
          })
          .where(and(admitted, eq(professionals.id, professional.id))),
        // Scope de cuenta actual, no una lista antigua de salas. Incluye grants
        // de lectura de salas cerradas; la inactividad ordinaria no los revoca.
        db
          .update(seekerSessions)
          .set({ revokedAt: new Date(lockedAt) })
          .where(
            and(
              admitted,
              isNull(seekerSessions.revokedAt),
              or(
                inArray(seekerSessions.conversationId, ownedRooms),
                ...(patientAccount
                  ? [inArray(seekerSessions.conversationId, patientRooms)]
                  : []),
              ),
            ),
          ),
      ];
      if (patientAccount)
        writes.push(
          db
            .update(patientAccounts)
            .set({ deletionState: "deleting" })
            .where(and(admitted, eq(patientAccounts.userId, userId))),
        );
      const result = await db.batch(writes);
      if (!Array.isArray(result[0]) || result[0].length !== 1)
        throw new Error(
          "La cuenta o tu sesión cambió. Vuelve a intentar la eliminación.",
        );
      lockedProfessional = {
        ...professional,
        status: "deleting",
        acceptingRequests: false,
        updatedAt: lockedAt,
      };
    }
    if (patientAccount && !professional) {
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
    // Una baja profesional queda bloqueada y revocada antes de efectos externos.
    // Si un proveedor ya actuó, nunca se reactiva ni se pierden sus referencias.
    if (professional && lockedProfessional && intent) {
      const expected = lockedProfessional;
      const deletionIntent = intent;
      const proVersion = () =>
        and(
          eq(professionals.id, expected.id),
          eq(professionals.userId, expected.userId),
          eq(professionals.status, "deleting"),
          eq(professionals.updatedAt, expected.updatedAt),
          eq(
            professionals.currentActiveRequests,
            expected.currentActiveRequests,
          ),
        );
      async function assertIntent() {
        const [row] = await db
          .select({ id: professionals.id })
          .from(professionals)
          .where(and(accountDeletionIntentGuard(deletionIntent), proVersion()));
        if (!row)
          throw new Error(
            "La cuenta o tu sesión cambió. Vuelve a intentar la eliminación.",
          );
      }
      await assertIntent();
      if (patientAccount) await preparePatientAccountPurge(userId);
      await assertIntent();
      await prepareCalendarAccountPurge(userId);
      await assertIntent();
      await preparePracticePurge(professional.id);
      await closeAccountAssignments({ id: professional.id, expected, intent });
      expected.currentActiveRequests = 0;
      purgeRooms = await accountRoomsSnapshot(professional.id);

      // Los chats se borran de verdad: el espejo D1 se elimina en el batch de
      // abajo, pero el CONTENIDO vive en el Durable Object de cada conversación.
      // Si algún DO falla, conservamos TODAS las referencias D1 y el perfil en
      // deleting. La persona mantiene su sesión para reintentar; los chats ya
      // purgados se pueden vaciar otra vez de forma idempotente.
      let messagesPurgeFailed = false;
      for (const conversation of purgeRooms) {
        await assertIntent();
        const [room] = await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, conversation.id),
              accountRoomsMatch(professional.id, purgeRooms),
            ),
          );
        if (!room)
          throw new Error("El chat cambió. Vuelve a intentar la eliminación.");
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
    const deletes: [
      BatchItem<"sqlite"> & SQLWrapper,
      ...(BatchItem<"sqlite"> & SQLWrapper)[],
    ] = [
      ...pushAccountDeleteStatements(userId),
      db.delete(session).where(eq(session.userId, userId)),
      ...calendarAccountDeleteStatements(userId),
      db.delete(account).where(eq(account.userId, userId)),
      ...professionalDeletes,
      ...patientAccountDeleteStatements(userId),
      db.delete(user).where(eq(user.id, userId)),
    ];
    if (professional && lockedProfessional && intent) {
      const finalId = newId("log");
      const admitted = sql`EXISTS (SELECT 1 FROM ${auditLogs} WHERE ${auditLogs.id}=${finalId})`;
      const guard = and(
        accountDeletionIntentGuard(intent),
        eq(professionals.id, professional.id),
        eq(professionals.userId, userId),
        eq(professionals.status, "deleting"),
        eq(professionals.updatedAt, lockedProfessional.updatedAt),
        eq(professionals.currentActiveRequests, 0),
        accountRoomsMatch(professional.id, purgeRooms),
        sql`NOT EXISTS (SELECT 1 FROM ${assignments} WHERE ${assignments.professionalId}=${professional.id} AND ${assignments.status} IN ('assigned','accepted'))`,
        sql`NOT EXISTS (SELECT 1 FROM ${conversations} WHERE ${conversations.professionalId}=${professional.id} AND ${conversations.status}='open')`,
        sql`NOT EXISTS (SELECT 1 FROM ${seekerSessions} JOIN ${conversations} ON ${conversations.id}=${seekerSessions.conversationId}
          WHERE ${conversations.professionalId}=${professional.id} AND ${seekerSessions.revokedAt} IS NULL)`,
      );
      const claim = db
        .insert(auditLogs)
        .select(sql`SELECT ${finalId},${intent.actor.email},
        'account_deletion_completed','user',${userId},NULL,${nowIso()} FROM ${professionals} WHERE ${guard}`)
        .returning({ id: auditLogs.id });
      // Todos los builders de borrado operativo anteriores llevan WHERE y no
      // RETURNING. Se añade el mismo marcador al SQL original completo, sin
      // alterar sus subconsultas ni depender de la sesión que el batch elimina.
      const guardedDeletes = deletes.map((statement) =>
        db.run(sql`${statement.getSQL()} AND ${admitted}`),
      );
      const result = await db.batch([claim, ...guardedDeletes]);
      if (!Array.isArray(result[0]) || result[0].length !== 1)
        throw new Error(
          "La cuenta, el chat o tu sesión cambió. Vuelve a intentar la eliminación.",
        );
    } else {
      await db.batch(deletes);
    }
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
