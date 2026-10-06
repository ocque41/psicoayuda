import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  practicePatients,
  professionals,
} from "@/db/schema";
import { PATIENT_PAGE_SIZE } from "@/lib/patient/queries";
import { pageNumber } from "@/lib/practice/queries";

/** Pagina los chats que admiten una propuesta, sin ocultar su historial. */
export async function patientSessionOptions(
  userId: string,
  requestedPage?: string,
) {
  const eligible = and(
    eq(patientConversationLinks.userId, userId),
    eq(patientAccounts.deletionState, "active"),
    eq(conversations.status, "open"),
    eq(professionals.status, "approved"),
    isNull(conversations.deletedAt),
    isNull(conversations.anonymizedAt),
  );
  const [count] = await db
    .select({ total: sql<number>`count(*)` })
    .from(patientConversationLinks)
    .innerJoin(patientAccounts, eq(patientAccounts.userId, userId))
    .innerJoin(
      conversations,
      eq(conversations.id, patientConversationLinks.conversationId),
    )
    .innerJoin(
      professionals,
      eq(professionals.id, conversations.professionalId),
    )
    .where(eligible);
  const total = Number(count?.total || 0);
  const pages = Math.max(1, Math.ceil(total / PATIENT_PAGE_SIZE));
  const page = Math.min(pageNumber(requestedPage), pages);
  const rows = await db
    .select({
      id: conversations.id,
      name: sql<string>`coalesce(${professionals.displayName}, ${professionals.fullName})`,
      program: practicePatients.program,
    })
    .from(patientConversationLinks)
    .innerJoin(patientAccounts, eq(patientAccounts.userId, userId))
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
      and(
        eq(practicePatients.conversationId, conversations.id),
        eq(practicePatients.professionalId, professionals.id),
      ),
    )
    .where(eligible)
    .orderBy(
      desc(conversations.lastMessageAt),
      desc(conversations.createdAt),
      desc(conversations.id),
    )
    .limit(PATIENT_PAGE_SIZE)
    .offset((page - 1) * PATIENT_PAGE_SIZE);
  return { rows, total, page, pages };
}
