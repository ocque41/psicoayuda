import "server-only";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  account,
  assignments,
  conversations,
  professionals,
  responseSamples,
  seekerSessions,
  session,
  user,
} from "@/db/schema";

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
