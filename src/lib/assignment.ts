import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  helpRequests,
  professionals,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";

export async function assignRequestToProfessional(input: {
  helpRequestId: string;
  professionalId: string;
  actorEmail: string;
}) {
  return db.transaction(async (tx) => {
    const existing = await tx.query.assignments.findFirst({
      where: and(
        eq(assignments.helpRequestId, input.helpRequestId),
        eq(assignments.professionalId, input.professionalId),
      ),
    });

    if (existing) {
      return { ok: false as const, reason: "duplicate" as const };
    }

    const updated = await tx
      .update(professionals)
      .set({
        currentActiveRequests: sql`${professionals.currentActiveRequests} + 1`,
        updatedAt: nowIso(),
      })
      .where(
        and(
          eq(professionals.id, input.professionalId),
          eq(professionals.status, "approved"),
          eq(professionals.acceptingRequests, true),
          eq(professionals.remoteAvailable, true),
          gt(
            professionals.maxActiveRequests,
            sql`${professionals.currentActiveRequests}`,
          ),
        ),
      )
      .returning({ id: professionals.id });

    if (updated.length === 0) {
      return { ok: false as const, reason: "capacity_or_status" as const };
    }

    const timestamp = nowIso();
    await tx.insert(assignments).values({
      id: newId("asg"),
      helpRequestId: input.helpRequestId,
      professionalId: input.professionalId,
      status: "assigned",
      source: "admin",
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await tx
      .update(helpRequests)
      .set({ status: "assigned", updatedAt: timestamp })
      .where(eq(helpRequests.id, input.helpRequestId));

    await tx.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: input.actorEmail,
      action: "request_assignment",
      entityType: "help_request",
      entityId: input.helpRequestId,
      metadata: JSON.stringify({ professionalId: input.professionalId }),
      createdAt: timestamp,
    });

    return { ok: true as const };
  });
}

/**
 * Cierra las asignaciones activas de una solicitud y libera capacidad del
 * profesional (currentActiveRequests, con piso en 0). Idempotente: solo toca
 * asignaciones en estado "assigned". Se invoca al cerrar/anonimizar.
 */
export async function releaseAssignmentsForRequest(helpRequestId: string) {
  return db.transaction(async (tx) => {
    const active = await tx.query.assignments.findMany({
      where: and(
        eq(assignments.helpRequestId, helpRequestId),
        eq(assignments.status, "assigned"),
      ),
    });

    const timestamp = nowIso();
    for (const assignment of active) {
      await tx
        .update(assignments)
        .set({ status: "closed", updatedAt: timestamp })
        .where(eq(assignments.id, assignment.id));
      await tx
        .update(professionals)
        .set({
          currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
          updatedAt: timestamp,
        })
        .where(eq(professionals.id, assignment.professionalId));
    }

    return active.length;
  });
}

/**
 * Al suspender/rechazar a un profesional: cierra sus asignaciones activas,
 * devuelve esas solicitudes a "new" para que puedan reasignarse y pone su
 * capacidad consumida a 0. Evita que personas queden silenciosamente huérfanas.
 */
export async function releaseProfessionalAssignments(professionalId: string) {
  return db.transaction(async (tx) => {
    const active = await tx.query.assignments.findMany({
      where: and(
        eq(assignments.professionalId, professionalId),
        eq(assignments.status, "assigned"),
      ),
    });

    const timestamp = nowIso();
    for (const assignment of active) {
      await tx
        .update(assignments)
        .set({ status: "closed", updatedAt: timestamp })
        .where(eq(assignments.id, assignment.id));
      await tx
        .update(helpRequests)
        .set({ status: "new", updatedAt: timestamp })
        .where(
          and(
            eq(helpRequests.id, assignment.helpRequestId),
            eq(helpRequests.status, "assigned"),
          ),
        );
    }

    await tx
      .update(professionals)
      .set({ currentActiveRequests: 0, updatedAt: timestamp })
      .where(eq(professionals.id, professionalId));

    return active.length;
  });
}
