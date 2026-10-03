import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
} from "@/db/patient-schema";
import {
  careCycles,
  carePlans,
  conversations,
  payments,
  practiceAppointments,
  practicePatients,
  practiceReceipts,
  practiceSettings,
  professionals,
} from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { pageNumber } from "@/lib/practice/queries";
import { cycleCredits } from "./credits";
export const PATIENT_PAGE_SIZE = 20;
function ownership(userId: string) {
  return and(
    eq(patientConversationLinks.userId, userId),
    isNull(conversations.anonymizedAt),
    isNull(conversations.deletedAt),
  );
}
export async function patientChats(userId: string, requestedPage: unknown = 1) {
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(patientConversationLinks)
    .innerJoin(
      conversations,
      eq(conversations.id, patientConversationLinks.conversationId),
    )
    .where(ownership(userId));
  const total = Number(count?.total || 0),
    pages = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE)),
    page = Math.min(
      pageNumber(
        typeof requestedPage === "string"
          ? requestedPage
          : String(requestedPage),
      ),
      pages,
    );
  const rows = await db
    .select({
      id: conversations.id,
      professionalId: professionals.id,
      name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
      status: conversations.status,
      lastMessageAt: conversations.lastMessageAt,
      lastMessageRole: conversations.lastMessageRole,
      lastReadAt: patientConversationLinks.lastReadAt,
      patientId: practicePatients.id,
      program: practicePatients.program,
    })
    .from(patientConversationLinks)
    .innerJoin(
      conversations,
      eq(conversations.id, patientConversationLinks.conversationId),
    )
    .innerJoin(
      professionals,
      eq(professionals.id, conversations.professionalId),
    )
    .leftJoin(
      practicePatients,
      eq(practicePatients.conversationId, conversations.id),
    )
    .where(ownership(userId))
    .orderBy(
      desc(conversations.lastMessageAt),
      desc(conversations.createdAt),
      desc(conversations.id),
    )
    .limit(PATIENT_PAGE_SIZE)
    .offset((page - 1) * PATIENT_PAGE_SIZE);
  return { rows, total, page, pages };
}
export async function patientAppointments(
  userId: string,
  options: {
    page?: unknown;
    from?: string;
    until?: string;
    upcoming?: boolean;
    calendar?: boolean;
  } = {},
) {
  const where = and(
    ownership(userId),
    options.from
      ? sql`${practiceAppointments.startsAt} >= ${options.from}`
      : undefined,
    options.until
      ? sql`${practiceAppointments.startsAt} < ${options.until}`
      : undefined,
    options.upcoming
      ? and(
          eq(practiceAppointments.status, "scheduled"),
          gt(practiceAppointments.endsAt, nowIso()),
        )
      : undefined,
  );
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(practiceAppointments)
    .innerJoin(
      practicePatients,
      eq(practicePatients.id, practiceAppointments.patientId),
    )
    .innerJoin(
      conversations,
      eq(conversations.id, practicePatients.conversationId),
    )
    .innerJoin(
      patientConversationLinks,
      eq(patientConversationLinks.conversationId, conversations.id),
    )
    .where(where);
  const total = Number(count?.total || 0),
    pages = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE)),
    page = Math.min(
      pageNumber(
        typeof options.page === "string"
          ? options.page
          : String(options.page ?? 1),
      ),
      pages,
    );
  const rows = await db
    .select({
      id: practiceAppointments.id,
      startsAt: practiceAppointments.startsAt,
      endsAt: practiceAppointments.endsAt,
      status: practiceAppointments.status,
      modality: practiceAppointments.modality,
      cancellationHours: practiceAppointments.cancellationHours,
      conversationId: conversations.id,
      name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
      program: practicePatients.program,
      priceCents: practiceAppointments.priceCents,
      currency: practiceAppointments.currency,
    })
    .from(practiceAppointments)
    .innerJoin(
      practicePatients,
      eq(practicePatients.id, practiceAppointments.patientId),
    )
    .innerJoin(
      conversations,
      eq(conversations.id, practicePatients.conversationId),
    )
    .innerJoin(
      patientConversationLinks,
      eq(patientConversationLinks.conversationId, conversations.id),
    )
    .innerJoin(
      professionals,
      eq(professionals.id, practiceAppointments.professionalId),
    )
    .where(where)
    .orderBy(
      options.upcoming
        ? asc(practiceAppointments.startsAt)
        : desc(practiceAppointments.startsAt),
      desc(practiceAppointments.id),
    )
    .limit(options.calendar ? 201 : PATIENT_PAGE_SIZE)
    .offset(options.calendar ? 0 : (page - 1) * PATIENT_PAGE_SIZE);
  return { rows, total, page, pages };
}
export async function patientPayments(
  userId: string,
  requestedPage: unknown = 1,
  options: { plansPage?: string; cyclesPage?: string; cardsPage?: string } = {},
) {
  const financialOwnership = and(
    ownership(userId),
    sql`EXISTS (SELECT 1 FROM patient_accounts a WHERE a.user_id=${userId} AND a.deletion_state='active')`,
  );
  const receiptPatient = and(
    eq(practicePatients.id, practiceReceipts.patientId),
    eq(practicePatients.professionalId, practiceReceipts.professionalId),
    sql`${practicePatients.program} != 'earthquake'`,
  );
  const planPatient = and(
    eq(practicePatients.id, carePlans.patientId),
    eq(practicePatients.professionalId, carePlans.professionalId),
    sql`${practicePatients.program} != 'earthquake'`,
  );
  const patientConversation = and(
    eq(conversations.id, practicePatients.conversationId),
    eq(conversations.professionalId, practicePatients.professionalId),
  );
  const cardConversation = and(
    eq(conversations.id, payments.conversationId),
    sql`(${payments.professionalId} IS NULL OR ${payments.professionalId}=${conversations.professionalId})`,
    isNull(conversations.helpRequestId),
    sql`NOT EXISTS (SELECT 1 FROM practice_patients pp WHERE pp.conversation_id=${conversations.id} AND pp.program='earthquake')`,
  );
  const [[count], [sectionCounts]] = await Promise.all([
    db
      .select({ total: sql<number>`count(*)` })
      .from(practiceReceipts)
      .innerJoin(practicePatients, receiptPatient)
      .innerJoin(conversations, patientConversation)
      .innerJoin(
        patientConversationLinks,
        eq(patientConversationLinks.conversationId, conversations.id),
      )
      .where(financialOwnership),
    db
      .select({
        plans: sql<number>`(SELECT count(*) FROM care_plans cp JOIN practice_patients pp ON pp.id=cp.patient_id AND pp.professional_id=cp.professional_id JOIN conversations c ON c.id=pp.conversation_id AND c.professional_id=pp.professional_id JOIN patient_conversation_links l ON l.conversation_id=c.id WHERE l.user_id=${userId} AND pp.program!='earthquake' AND c.deleted_at IS NULL AND c.anonymized_at IS NULL)`,
        cycles: sql<number>`(SELECT count(*) FROM care_cycles cc JOIN care_plans cp ON cp.id=cc.care_plan_id JOIN practice_patients pp ON pp.id=cp.patient_id AND pp.professional_id=cp.professional_id JOIN conversations c ON c.id=pp.conversation_id AND c.professional_id=pp.professional_id JOIN patient_conversation_links l ON l.conversation_id=c.id WHERE l.user_id=${userId} AND pp.program!='earthquake' AND c.deleted_at IS NULL AND c.anonymized_at IS NULL)`,
        cards: sql<number>`(SELECT count(*) FROM payments p JOIN conversations c ON c.id=p.conversation_id AND (p.professional_id IS NULL OR p.professional_id=c.professional_id) JOIN patient_conversation_links l ON l.conversation_id=c.id WHERE l.user_id=${userId} AND c.help_request_id IS NULL AND c.deleted_at IS NULL AND c.anonymized_at IS NULL AND NOT EXISTS (SELECT 1 FROM practice_patients pp WHERE pp.conversation_id=c.id AND pp.program='earthquake'))`,
      })
      .from(patientAccounts)
      .where(
        and(
          eq(patientAccounts.userId, userId),
          eq(patientAccounts.deletionState, "active"),
        ),
      )
      .limit(1),
  ]);
  const sectionPage = (total: number, requested?: string) => {
    const pages = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE));
    return { total, pages, page: Math.min(pageNumber(requested), pages) };
  };
  const receiptsPagination = sectionPage(
    Number(count?.total || 0),
    String(requestedPage),
  );
  const plansPagination = sectionPage(
    Number(sectionCounts?.plans || 0),
    options.plansPage,
  );
  const cyclesPagination = sectionPage(
    Number(sectionCounts?.cycles || 0),
    options.cyclesPage,
  );
  const cardsPagination = sectionPage(
    Number(sectionCounts?.cards || 0),
    options.cardsPage,
  );
  const [rows, plans, cycleRows, cards] = await Promise.all([
    db
      .select({
        id: practiceReceipts.id,
        amountCents: practiceReceipts.amountCents,
        currency: practiceReceipts.currency,
        method: practiceReceipts.method,
        receivedAt: practiceReceipts.receivedAt,
        name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
      })
      .from(practiceReceipts)
      .innerJoin(practicePatients, receiptPatient)
      .innerJoin(conversations, patientConversation)
      .innerJoin(
        patientConversationLinks,
        eq(patientConversationLinks.conversationId, conversations.id),
      )
      .innerJoin(
        professionals,
        eq(professionals.id, practiceReceipts.professionalId),
      )
      .where(financialOwnership)
      .orderBy(desc(practiceReceipts.receivedAt), desc(practiceReceipts.id))
      .limit(PATIENT_PAGE_SIZE)
      .offset((receiptsPagination.page - 1) * PATIENT_PAGE_SIZE),
    db
      .select({
        id: carePlans.id,
        title: carePlans.title,
        status: carePlans.status,
        priceCents: carePlans.priceCents,
        currency: carePlans.currency,
        interval: carePlans.interval,
        sessionsCount: carePlans.sessionsCount,
        durationMinutes: carePlans.durationMinutes,
        validityDays: carePlans.validityDays,
        conversationId: conversations.id,
        name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
      })
      .from(carePlans)
      .innerJoin(practicePatients, planPatient)
      .innerJoin(conversations, patientConversation)
      .innerJoin(
        patientConversationLinks,
        eq(patientConversationLinks.conversationId, conversations.id),
      )
      .innerJoin(professionals, eq(professionals.id, carePlans.professionalId))
      .where(financialOwnership)
      .orderBy(desc(carePlans.createdAt), desc(carePlans.id))
      .limit(PATIENT_PAGE_SIZE)
      .offset((plansPagination.page - 1) * PATIENT_PAGE_SIZE),
    db
      .select({
        id: careCycles.id,
        planId: carePlans.id,
        amountCents: careCycles.amountCents,
        currency: careCycles.currency,
        startsAt: careCycles.startsAt,
        endsAt: careCycles.endsAt,
        status: careCycles.status,
        sessionsCount: careCycles.sessionsCount,
        title: carePlans.title,
        conversationId: conversations.id,
        name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
        confirmation: sql<
          "processor" | "manual" | "unknown"
        >`CASE WHEN ${careCycles.externalReference} LIKE 'stripe:%' THEN 'processor' WHEN ${careCycles.externalReference} LIKE 'external:%' THEN 'manual' ELSE 'unknown' END`,
      })
      .from(careCycles)
      .innerJoin(carePlans, eq(carePlans.id, careCycles.carePlanId))
      .innerJoin(practicePatients, planPatient)
      .innerJoin(conversations, patientConversation)
      .innerJoin(
        patientConversationLinks,
        eq(patientConversationLinks.conversationId, conversations.id),
      )
      .innerJoin(professionals, eq(professionals.id, carePlans.professionalId))
      .where(financialOwnership)
      .orderBy(desc(careCycles.createdAt), desc(careCycles.id))
      .limit(PATIENT_PAGE_SIZE)
      .offset((cyclesPagination.page - 1) * PATIENT_PAGE_SIZE),
    db
      .select({
        id: payments.id,
        title: payments.packageTitle,
        professionalName: payments.professionalName,
        amountCents: payments.amountCents,
        currency: payments.currency,
        status: payments.status,
        createdAt: payments.createdAt,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(conversations, cardConversation)
      .innerJoin(
        patientConversationLinks,
        eq(patientConversationLinks.conversationId, conversations.id),
      )
      .where(financialOwnership)
      .orderBy(desc(payments.createdAt), desc(payments.id))
      .limit(PATIENT_PAGE_SIZE)
      .offset((cardsPagination.page - 1) * PATIENT_PAGE_SIZE),
  ]);
  // Una consulta agrupada, limitada a los 20 ciclos visibles e indexada por
  // care_cycle_id/status. El count no filtra fechas: una reserva pasada sigue
  // ocupando crédito hasta que el profesional cambie su estado.
  const usage = cycleRows.length
    ? await db
        .select({
          cycleId: practiceAppointments.careCycleId,
          consumed: sql<number>`sum(CASE WHEN ${practiceAppointments.status} != 'cancelled' THEN 1 ELSE 0 END)`,
          completed: sql<number>`sum(CASE WHEN ${practiceAppointments.status} = 'completed' THEN 1 ELSE 0 END)`,
          reserved: sql<number>`sum(CASE WHEN ${practiceAppointments.status} = 'scheduled' THEN 1 ELSE 0 END)`,
          noShows: sql<number>`sum(CASE WHEN ${practiceAppointments.status} = 'no_show' THEN 1 ELSE 0 END)`,
          cancelled: sql<number>`sum(CASE WHEN ${practiceAppointments.status} = 'cancelled' THEN 1 ELSE 0 END)`,
        })
        .from(practiceAppointments)
        .where(
          inArray(
            practiceAppointments.careCycleId,
            cycleRows.map((cycle) => cycle.id),
          ),
        )
        .groupBy(practiceAppointments.careCycleId)
    : [];
  const usageByCycle = new Map(usage.map((value) => [value.cycleId, value]));
  const at = nowIso();
  const cycles = cycleRows.map((cycle) => ({
    ...cycle,
    credits: cycleCredits(
      cycle,
      usageByCycle.get(cycle.id) ?? {
        consumed: 0,
        completed: 0,
        reserved: 0,
        noShows: 0,
        cancelled: 0,
      },
      at,
    ),
  }));
  return {
    rows,
    plans,
    cycles,
    cards,
    plansPagination,
    cyclesPagination,
    cardsPagination,
    ...receiptsPagination,
  };
}
export async function patientRequests(userId: string, page = 1) {
  return db
    .select({
      id: patientSessionRequests.id,
      conversationId: patientSessionRequests.conversationId,
      appointmentId: patientSessionRequests.appointmentId,
      kind: patientSessionRequests.kind,
      status: patientSessionRequests.status,
      reason: patientSessionRequests.reason,
      preferredStartsAt: patientSessionRequests.preferredStartsAt,
      timezone: patientSessionRequests.timezone,
      createdAt: patientSessionRequests.createdAt,
      updatedAt: patientSessionRequests.updatedAt,
      linkedStartsAt: practiceAppointments.startsAt,
      linkedTimeZone: practiceAppointments.timeZone,
      linkedStatus: practiceAppointments.status,
      linkedUpdatedAt: practiceAppointments.updatedAt,
      professionalTimezone: sql<string>`coalesce(${practiceSettings.timeZone}, 'America/Caracas')`,
      name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
    })
    .from(patientSessionRequests)
    .innerJoin(
      conversations,
      eq(conversations.id, patientSessionRequests.conversationId),
    )
    .innerJoin(
      professionals,
      eq(professionals.id, conversations.professionalId),
    )
    .innerJoin(
      patientConversationLinks,
      and(
        eq(patientConversationLinks.conversationId, conversations.id),
        eq(patientConversationLinks.userId, patientSessionRequests.userId),
      ),
    )
    .leftJoin(
      practiceSettings,
      eq(practiceSettings.professionalId, professionals.id),
    )
    .leftJoin(
      practicePatients,
      and(
        eq(practicePatients.conversationId, conversations.id),
        eq(practicePatients.professionalId, professionals.id),
      ),
    )
    .leftJoin(
      practiceAppointments,
      and(
        eq(practiceAppointments.id, patientSessionRequests.appointmentId),
        eq(practiceAppointments.professionalId, professionals.id),
        eq(practiceAppointments.patientId, practicePatients.id),
      ),
    )
    .where(patientRequestScope(userId))
    .orderBy(
      desc(patientSessionRequests.createdAt),
      desc(patientSessionRequests.id),
    )
    .limit(PATIENT_PAGE_SIZE)
    .offset((pageNumber(String(page)) - 1) * PATIENT_PAGE_SIZE);
}

function patientRequestScope(userId: string) {
  return and(
    eq(patientSessionRequests.userId, userId),
    ownership(userId),
    sql`EXISTS(SELECT 1 FROM patient_accounts a WHERE a.user_id=${userId} AND a.deletion_state='active')`,
  );
}

export async function patientRequestCounts(userId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`coalesce(sum(CASE WHEN ${patientSessionRequests.status}='pending' THEN 1 ELSE 0 END),0)`,
    })
    .from(patientSessionRequests)
    .innerJoin(
      conversations,
      eq(conversations.id, patientSessionRequests.conversationId),
    )
    .innerJoin(
      patientConversationLinks,
      and(
        eq(patientConversationLinks.conversationId, conversations.id),
        eq(patientConversationLinks.userId, patientSessionRequests.userId),
      ),
    )
    .where(patientRequestScope(userId));
  return { total: Number(row?.total || 0), pending: Number(row?.pending || 0) };
}
