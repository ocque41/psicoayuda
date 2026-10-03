import "server-only";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
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
  professionals,
} from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { pageNumber } from "@/lib/practice/queries";
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
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(practiceReceipts)
    .innerJoin(
      practicePatients,
      eq(practicePatients.id, practiceReceipts.patientId),
    )
    .innerJoin(
      conversations,
      eq(conversations.id, practicePatients.conversationId),
    )
    .innerJoin(
      patientConversationLinks,
      eq(patientConversationLinks.conversationId, conversations.id),
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
      id: practiceReceipts.id,
      amountCents: practiceReceipts.amountCents,
      currency: practiceReceipts.currency,
      method: practiceReceipts.method,
      receivedAt: practiceReceipts.receivedAt,
      name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
    })
    .from(practiceReceipts)
    .innerJoin(
      practicePatients,
      eq(practicePatients.id, practiceReceipts.patientId),
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
      eq(professionals.id, practiceReceipts.professionalId),
    )
    .where(ownership(userId))
    .orderBy(desc(practiceReceipts.receivedAt), desc(practiceReceipts.id))
    .limit(PATIENT_PAGE_SIZE)
    .offset((page - 1) * PATIENT_PAGE_SIZE);
  const [sectionCounts] = await db
    .select({
      plans: sql<number>`(SELECT count(*) FROM care_plans cp JOIN practice_patients pp ON pp.id=cp.patient_id JOIN conversations c ON c.id=pp.conversation_id JOIN patient_conversation_links l ON l.conversation_id=c.id WHERE l.user_id=${userId} AND c.deleted_at IS NULL AND c.anonymized_at IS NULL)`,
      cycles: sql<number>`(SELECT count(*) FROM care_cycles cc JOIN care_plans cp ON cp.id=cc.care_plan_id JOIN practice_patients pp ON pp.id=cp.patient_id JOIN conversations c ON c.id=pp.conversation_id JOIN patient_conversation_links l ON l.conversation_id=c.id WHERE l.user_id=${userId} AND c.deleted_at IS NULL AND c.anonymized_at IS NULL)`,
      cards: sql<number>`(SELECT count(*) FROM payments p JOIN conversations c ON c.id=p.conversation_id JOIN patient_conversation_links l ON l.conversation_id=c.id WHERE l.user_id=${userId} AND c.deleted_at IS NULL AND c.anonymized_at IS NULL)`,
    })
    .from(patientConversationLinks)
    .where(eq(patientConversationLinks.userId, userId))
    .limit(1);
  const sectionPage = (total: number, requested?: string) => {
    const pages = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE));
    return { total, pages, page: Math.min(pageNumber(requested), pages) };
  };
  const plansPagination = sectionPage(
      Number(sectionCounts?.plans || 0),
      options.plansPage,
    ),
    cyclesPagination = sectionPage(
      Number(sectionCounts?.cycles || 0),
      options.cyclesPage,
    ),
    cardsPagination = sectionPage(
      Number(sectionCounts?.cards || 0),
      options.cardsPage,
    );
  const plans = await db
    .select({
      id: carePlans.id,
      title: carePlans.title,
      status: carePlans.status,
      priceCents: carePlans.priceCents,
      currency: carePlans.currency,
      interval: carePlans.interval,
      conversationId: conversations.id,
      name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
    })
    .from(carePlans)
    .innerJoin(practicePatients, eq(practicePatients.id, carePlans.patientId))
    .innerJoin(
      conversations,
      eq(conversations.id, practicePatients.conversationId),
    )
    .innerJoin(
      patientConversationLinks,
      eq(patientConversationLinks.conversationId, conversations.id),
    )
    .innerJoin(professionals, eq(professionals.id, carePlans.professionalId))
    .where(ownership(userId))
    .orderBy(desc(carePlans.createdAt), desc(carePlans.id))
    .limit(PATIENT_PAGE_SIZE)
    .offset((plansPagination.page - 1) * PATIENT_PAGE_SIZE);
  const cycles = await db
    .select({
      id: careCycles.id,
      planId: carePlans.id,
      amountCents: careCycles.amountCents,
      currency: careCycles.currency,
      startsAt: careCycles.startsAt,
      endsAt: careCycles.endsAt,
      status: careCycles.status,
      title: carePlans.title,
    })
    .from(careCycles)
    .innerJoin(carePlans, eq(carePlans.id, careCycles.carePlanId))
    .innerJoin(practicePatients, eq(practicePatients.id, carePlans.patientId))
    .innerJoin(
      conversations,
      eq(conversations.id, practicePatients.conversationId),
    )
    .innerJoin(
      patientConversationLinks,
      eq(patientConversationLinks.conversationId, conversations.id),
    )
    .where(ownership(userId))
    .orderBy(desc(careCycles.createdAt), desc(careCycles.id))
    .limit(PATIENT_PAGE_SIZE)
    .offset((cyclesPagination.page - 1) * PATIENT_PAGE_SIZE);
  const cards = await db
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
    .innerJoin(conversations, eq(conversations.id, payments.conversationId))
    .innerJoin(
      patientConversationLinks,
      eq(patientConversationLinks.conversationId, conversations.id),
    )
    .where(ownership(userId))
    .orderBy(desc(payments.createdAt), desc(payments.id))
    .limit(PATIENT_PAGE_SIZE)
    .offset((cardsPagination.page - 1) * PATIENT_PAGE_SIZE);

  return {
    rows,
    plans,
    cycles,
    cards,
    plansPagination,
    cyclesPagination,
    cardsPagination,
    total,
    page,
    pages,
  };
}
export async function patientRequests(userId: string, page = 1) {
  return db
    .select({
      id: patientSessionRequests.id,
      kind: patientSessionRequests.kind,
      status: patientSessionRequests.status,
      preferredStartsAt: patientSessionRequests.preferredStartsAt,
      timezone: patientSessionRequests.timezone,
      createdAt: patientSessionRequests.createdAt,
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
    .where(eq(patientSessionRequests.userId, userId))
    .orderBy(
      desc(patientSessionRequests.createdAt),
      desc(patientSessionRequests.id),
    )
    .limit(20)
    .offset((Math.max(1, page) - 1) * 20);
}

export async function patientRequestCounts(userId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      pending: sql<number>`coalesce(sum(CASE WHEN ${patientSessionRequests.status}='pending' THEN 1 ELSE 0 END),0)`,
    })
    .from(patientSessionRequests)
    .where(eq(patientSessionRequests.userId, userId));
  return { total: Number(row?.total || 0), pending: Number(row?.pending || 0) };
}
