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
 * Release every active ("assigned") assignment for a help request and return the
 * freed capacity to each professional. Used when the retention job closes or
 * anonymizes a stale request so professional load counters stay accurate.
 *
 * Intentionally non-transactional: it runs from the retention cron over D1,
 * where explicit BEGIN/COMMIT is unsupported, and `max(0, ...)` keeps the
 * counter from underflowing if it is already at zero.
 */
export async function releaseAssignmentsForRequest(helpRequestId: string) {
  const active = await db
    .select({ professionalId: assignments.professionalId })
    .from(assignments)
    .where(
      and(
        eq(assignments.helpRequestId, helpRequestId),
        eq(assignments.status, "assigned"),
      ),
    );

  if (active.length === 0) {
    return { released: 0 };
  }

  const timestamp = nowIso();

  for (const { professionalId } of active) {
    await db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
        updatedAt: timestamp,
      })
      .where(eq(professionals.id, professionalId));
  }

  await db
    .update(assignments)
    .set({ status: "released", updatedAt: timestamp })
    .where(
      and(
        eq(assignments.helpRequestId, helpRequestId),
        eq(assignments.status, "assigned"),
      ),
    );

  return { released: active.length };
}
