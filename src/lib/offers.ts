import "server-only";

import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
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
import { needLabels, urgencyLabels } from "@/lib/constants";
import { newId, nowIso } from "@/lib/ids";
import { notifyProfessionalNewOffer } from "@/lib/notifications";
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
  const createdFor: string[] = [];
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
    if (inserted.length > 0) createdFor.push(professionalId);
  }

  const created = createdFor.length;
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

    // Notifica por correo a cada profesional recién ofertado (privacy-safe: sin
    // datos de la persona). Sin esto, el pro solo se enteraba si miraba el panel
    // por casualidad. Best-effort: no rompemos la difusión si el correo falla.
    await notifyOfferedProfessionals(helpRequestId, createdFor);
  }

  return created;
}

async function notifyOfferedProfessionals(
  helpRequestId: string,
  professionalIds: string[],
) {
  try {
    const request = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, helpRequestId),
    });
    const needLabel = request
      ? (needLabels[request.needCategory as keyof typeof needLabels] ??
        undefined)
      : undefined;
    const urgencyLabel = request
      ? (urgencyLabels[request.urgency as keyof typeof urgencyLabels] ??
        undefined)
      : undefined;
    const pros = await db
      .select({
        email: professionals.email,
        displayName: professionals.displayName,
        fullName: professionals.fullName,
      })
      .from(professionals)
      .where(inArray(professionals.id, professionalIds));
    await Promise.allSettled(
      pros.map((pro) =>
        notifyProfessionalNewOffer({
          professionalEmail: pro.email,
          professionalName: pro.displayName ?? pro.fullName,
          needLabel,
          urgencyLabel,
        }),
      ),
    );
  } catch {
    // best-effort: la difusión ya quedó registrada
  }
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
  const timestamp = nowIso();

  // D1 no soporta transacciones por SQL (ver assignment.ts): usamos dos puertas
  // atómicas + compensación. (1) Reclamar la oferta marcándola "accepted" SOLO si
  // sigue "offered" (gana exactamente uno, incluso ante doble clic / carrera).
  const claimed = await db
    .update(assignments)
    .set({ status: "accepted", updatedAt: timestamp })
    .where(
      and(
        eq(assignments.id, input.assignmentId),
        eq(assignments.professionalId, input.professionalId),
        eq(assignments.status, "offered"),
      ),
    )
    .returning({
      id: assignments.id,
      helpRequestId: assignments.helpRequestId,
    });
  const offer = claimed[0];
  if (!offer) return { ok: false as const, reason: "not_found" as const };

  // (2) Reserva cupo solo si el profesional sigue elegible y por debajo del
  // máximo. Si no hay cupo, devuelve la oferta a "offered" para que otro acepte.
  const reserved = await db
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
        sql`${professionals.currentActiveRequests} < ${professionals.maxActiveRequests}`,
      ),
    )
    .returning({ id: professionals.id });
  if (reserved.length === 0) {
    await db
      .update(assignments)
      .set({ status: "offered", updatedAt: nowIso() })
      .where(eq(assignments.id, offer.id));
    return { ok: false as const, reason: "capacity_or_status" as const };
  }

  try {
    const request = await db.query.helpRequests.findFirst({
      where: eq(helpRequests.id, offer.helpRequestId),
    });

    // BUG-B: reclama la solicitud de forma ATÓMICA antes de crear nada. Solo
    // "gana" si sigue reclamable (new/offered). Si otro flujo (asignación admin u
    // otra oferta) ya la tomó, compensamos cupo+oferta y salimos sin duplicar.
    const claimedRequest = await db
      .update(helpRequests)
      .set({ status: "assigned", updatedAt: timestamp })
      .where(
        and(
          eq(helpRequests.id, offer.helpRequestId),
          inArray(helpRequests.status, ["new", "offered"]),
        ),
      )
      .returning({ id: helpRequests.id });
    if (claimedRequest.length === 0) {
      await db
        .update(professionals)
        .set({
          currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
          updatedAt: nowIso(),
        })
        .where(eq(professionals.id, input.professionalId));
      await db
        .update(assignments)
        .set({ status: "offered", updatedAt: nowIso() })
        .where(eq(assignments.id, offer.id));
      return { ok: false as const, reason: "capacity_or_status" as const };
    }

    // Conversación + sesión del seeker (sin cookie: el seeker llega por correo).
    const conversationId = newId("conv");
    const sid = newId("seek");

    // El token solo necesita ids + secreto (no toca la BD): mintarlo ANTES del
    // batch evita dejar una conversación escrita si la firma fallara.
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

    // Las cuatro escrituras van en UN batch atómico (D1 soporta batch aunque
    // rechace BEGIN/COMMIT): conversación + sesión del seeker, cierre de las
    // ofertas hermanas y auditoría. Todo-o-nada: si algo falla, no queda nada
    // escrito, así que no hay conversaciones huérfanas/duplicadas ni ofertas
    // hermanas cerradas a medias (la solicitud ya se reclamó arriba).
    await db.batch([
      db.insert(conversations).values({
        id: conversationId,
        helpRequestId: offer.helpRequestId,
        professionalId: input.professionalId,
        seekerSid: sid,
        status: "open",
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
      db.insert(seekerSessions).values({
        sid,
        conversationId,
        requesterHash: request?.requesterHash ?? null,
        role: "seeker",
        issuedAt: new Date(now),
        expiresAt: new Date(now + TOKEN_TTL_MS),
      }),
      db
        .update(assignments)
        .set({ status: "closed", updatedAt: timestamp })
        .where(
          and(
            eq(assignments.helpRequestId, offer.helpRequestId),
            eq(assignments.status, "offered"),
            ne(assignments.id, offer.id),
          ),
        ),
      db.insert(auditLogs).values({
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
      }),
    ]);

    return {
      ok: true as const,
      conversationId,
      seekerToken,
      seekerEmail: request?.email ?? null,
    };
  } catch (error) {
    // Algo falló tras reclamar+reservar: compensa cupo y devuelve la oferta.
    await db
      .update(professionals)
      .set({
        currentActiveRequests: sql`max(0, ${professionals.currentActiveRequests} - 1)`,
        updatedAt: nowIso(),
      })
      .where(eq(professionals.id, input.professionalId));
    await db
      .update(assignments)
      .set({ status: "offered", updatedAt: nowIso() })
      .where(eq(assignments.id, offer.id));
    // La solicitud se reclamó (-> "assigned") antes del batch; como el batch es
    // atómico y no escribió nada, la devolvemos a "offered".
    await db
      .update(helpRequests)
      .set({ status: "offered", updatedAt: nowIso() })
      .where(
        and(
          eq(helpRequests.id, offer.helpRequestId),
          eq(helpRequests.status, "assigned"),
        ),
      );
    throw error;
  }
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
