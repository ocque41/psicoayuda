import "server-only";

import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  auditLogs,
  conversations,
  helpRequests,
  professionals,
  seekerSessions,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { newId, nowIso } from "@/lib/ids";
import { mintSeekerToken } from "@/lib/seeker-token";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h

/**
 * Difunde una solicitud a profesionales (capa de "ofertas" sobre `assignments`,
 * status="offered"). NO consume cupo: el cupo se reserva solo al aceptar. Es
 * idempotente — el índice único (helpRequestId, professionalId) evita duplicar.
 * Devuelve cuántas ofertas nuevas se crearon.
 *
 * Solo se ofrece a profesionales aprobados, remotos, que aceptan y con cupo.
 */
export async function offerRequestToProfessionals(
  helpRequestId: string,
  professionalIds: string[],
): Promise<number> {
  if (professionalIds.length === 0) return 0;

  // Filtra a los elegibles (aprobados + aceptando + remotos + con cupo).
  const eligible = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(
      and(
        eq(professionals.status, "approved"),
        eq(professionals.acceptingRequests, true),
        eq(professionals.remoteAvailable, true),
        sql`${professionals.currentActiveRequests} < ${professionals.maxActiveRequests}`,
      ),
    );
  const eligibleIds = new Set(eligible.map((p) => p.id));
  const targets = professionalIds.filter((id) => eligibleIds.has(id));
  if (targets.length === 0) return 0;

  const timestamp = nowIso();
  let created = 0;
  for (const professionalId of targets) {
    const inserted = await db
      .insert(assignments)
      .values({
        id: newId("offer"),
        helpRequestId,
        professionalId,
        status: "offered",
        source: "seeker",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing()
      .returning({ id: assignments.id });
    if (inserted.length > 0) created += 1;
  }

  if (created > 0) {
    await db
      .update(helpRequests)
      .set({ status: "offered", updatedAt: timestamp })
      .where(
        and(eq(helpRequests.id, helpRequestId), eq(helpRequests.status, "new")),
      );

    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: null,
      action: "request_offered",
      entityType: "help_request",
      entityId: helpRequestId,
      metadata: JSON.stringify({ offered: created, source: "seeker" }),
      createdAt: timestamp,
    });
  }

  return created;
}

export type AcceptOfferResult =
  | {
      ok: true;
      conversationId: string;
      seekerToken: string;
      seekerEmail: string | null;
    }
  | { ok: false; reason: "not_found" | "capacity_or_status" };

/**
 * Un profesional acepta una oferta. En una transacción: valida que la oferta es
 * suya y sigue "offered", reserva cupo (con guardas), marca la oferta "accepted",
 * crea la conversación + sesión del seeker, cierra las demás ofertas de esa
 * solicitud (gana el primero que acepta) y deja rastro de auditoría. Devuelve el
 * token del seeker para enviárselo por correo.
 */
export async function acceptOffer(input: {
  assignmentId: string;
  professionalId: string;
  actorEmail: string;
}): Promise<AcceptOfferResult> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const offer = await tx.query.assignments.findFirst({
      where: and(
        eq(assignments.id, input.assignmentId),
        eq(assignments.professionalId, input.professionalId),
        eq(assignments.status, "offered"),
      ),
    });
    if (!offer) return { ok: false as const, reason: "not_found" as const };

    // Reserva cupo solo si el profesional sigue elegible y por debajo del máximo.
    const reserved = await tx
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
          sql`${professionals.currentActiveRequests} < ${professionals.maxActiveRequests}`,
        ),
      )
      .returning({ id: professionals.id });
    if (reserved.length === 0) {
      return { ok: false as const, reason: "capacity_or_status" as const };
    }

    const timestamp = nowIso();
    const request = await tx.query.helpRequests.findFirst({
      where: eq(helpRequests.id, offer.helpRequestId),
    });

    // Conversación + sesión del seeker (sin cookie: el seeker llega por correo).
    const conversationId = newId("conv");
    const sid = newId("seek");
    await tx.insert(conversations).values({
      id: conversationId,
      helpRequestId: offer.helpRequestId,
      professionalId: input.professionalId,
      seekerSid: sid,
      status: "open",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await tx.insert(seekerSessions).values({
      sid,
      conversationId,
      requesterHash: request?.requesterHash ?? null,
      role: "seeker",
      issuedAt: new Date(now),
      expiresAt: new Date(now + TOKEN_TTL_MS),
    });

    // Esta oferta -> aceptada; las hermanas (otras de la misma solicitud) cierran.
    await tx
      .update(assignments)
      .set({ status: "accepted", updatedAt: timestamp })
      .where(eq(assignments.id, offer.id));
    await tx
      .update(assignments)
      .set({ status: "closed", updatedAt: timestamp })
      .where(
        and(
          eq(assignments.helpRequestId, offer.helpRequestId),
          eq(assignments.status, "offered"),
          ne(assignments.id, offer.id),
        ),
      );
    await tx
      .update(helpRequests)
      .set({ status: "assigned", updatedAt: timestamp })
      .where(eq(helpRequests.id, offer.helpRequestId));

    await tx.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: input.actorEmail,
      action: "offer_accepted",
      entityType: "help_request",
      entityId: offer.helpRequestId,
      metadata: JSON.stringify({
        professionalId: input.professionalId,
        conversationId,
      }),
      createdAt: timestamp,
    });

    const seekerToken = mintSeekerToken(
      {
        sid,
        conversationId,
        helpRequestId: offer.helpRequestId,
        role: "seeker",
        iat: now,
        exp: now + TOKEN_TTL_MS,
      },
      getAuthSecret(),
    );

    return {
      ok: true as const,
      conversationId,
      seekerToken,
      seekerEmail: request?.email ?? null,
    };
  });
}

/** Ofertas pendientes ("offered") visibles para un profesional, con datos mínimos. */
export async function pendingOffersForProfessional(professionalId: string) {
  const rows = await db
    .select({
      assignmentId: assignments.id,
      createdAt: assignments.createdAt,
      needCategory: helpRequests.needCategory,
      urgency: helpRequests.urgency,
      language: helpRequests.language,
      state: helpRequests.state,
    })
    .from(assignments)
    .innerJoin(helpRequests, eq(assignments.helpRequestId, helpRequests.id))
    .where(
      and(
        eq(assignments.professionalId, professionalId),
        eq(assignments.status, "offered"),
      ),
    );
  return rows;
}

/** Conversaciones del profesional (su bandeja de chats), más recientes primero. */
export async function conversationsForProfessional(professionalId: string) {
  return db
    .select({
      conversationId: conversations.id,
      status: conversations.status,
      createdAt: conversations.createdAt,
      needCategory: helpRequests.needCategory,
      urgency: helpRequests.urgency,
    })
    .from(conversations)
    .leftJoin(helpRequests, eq(conversations.helpRequestId, helpRequests.id))
    .where(eq(conversations.professionalId, professionalId))
    .orderBy(desc(conversations.createdAt));
}
