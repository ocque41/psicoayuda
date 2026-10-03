import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { conversations, practicePatients } from "@/db/schema";
import { patientStates } from "@/lib/practice/domain";

export const PRACTICE_PAGE_SIZE = 25;
export function pageNumber(value?: string) {
  return value && /^\d{1,5}$/.test(value)
    ? Math.max(1, Math.min(10000, Number(value)))
    : 1;
}
export async function patientList(
  professionalId: string,
  query: { q?: string; estado?: string; pagina?: string },
) {
  const term = (query.q || "").trim().slice(0, 80);
  const state = patientStates.find((s) => s === query.estado);
  // `%` y `_` escritos por la persona son literales, no comodines SQL.
  const escaped = term.toLocaleLowerCase("es").replace(/[\\%_]/g, "\\$&");
  let searchName = sql`${practicePatients.name}`;
  for (const [upper, lower] of [
    ["Á", "á"],
    ["É", "é"],
    ["Í", "í"],
    ["Ó", "ó"],
    ["Ú", "ú"],
    ["Ü", "ü"],
    ["Ñ", "ñ"],
  ])
    searchName = sql`replace(${searchName}, ${upper}, ${lower})`;
  const condition = and(
    eq(practicePatients.professionalId, professionalId),
    state ? eq(practicePatients.status, state) : undefined,
    term
      ? sql`lower(${searchName}) LIKE ${`%${escaped}%`} ESCAPE '\\'`
      : undefined,
  );
  const [total] = await db
    .select({ count: sql<number>`count(*)` })
    .from(practicePatients)
    .where(condition);
  const pages = Math.max(
    1,
    Math.ceil(Number(total.count) / PRACTICE_PAGE_SIZE),
  );
  const page = Math.min(pageNumber(query.pagina), pages);
  const rows = await db
    .select({
      id: practicePatients.id,
      name: practicePatients.name,
      program: practicePatients.program,
      status: practicePatients.status,
    })
    .from(practicePatients)
    .where(condition)
    .orderBy(desc(practicePatients.updatedAt), desc(practicePatients.id))
    .limit(PRACTICE_PAGE_SIZE)
    .offset((page - 1) * PRACTICE_PAGE_SIZE);
  return { rows, page, pages, total: Number(total.count), term, state };
}
export async function chatList(professionalId: string, value?: string) {
  const condition = and(
    eq(conversations.professionalId, professionalId),
    eq(conversations.status, "open"),
    isNull(conversations.deletedAt),
  );
  const [total] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversations)
    .where(condition);
  const pages = Math.max(
    1,
    Math.ceil(Number(total.count) / PRACTICE_PAGE_SIZE),
  );
  const page = Math.min(pageNumber(value), pages);
  const rows = await db
    .select({
      id: conversations.id,
      helpRequestId: conversations.helpRequestId,
      name: conversations.seekerName,
      email: conversations.seekerEmail,
      quotaReleasedAt: conversations.quotaReleasedAt,
      patientId: practicePatients.id,
    })
    .from(conversations)
    .leftJoin(
      practicePatients,
      and(
        eq(practicePatients.conversationId, conversations.id),
        eq(practicePatients.professionalId, professionalId),
      ),
    )
    .where(condition)
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .limit(PRACTICE_PAGE_SIZE)
    .offset((page - 1) * PRACTICE_PAGE_SIZE);
  return { rows, page, pages, total: Number(total.count) };
}
export async function inboxSummary(professionalId: string) {
  const [row] = await db
    .select({
      unread: sql<number>`count(*)`,
      latest: sql<number | null>`max(${conversations.lastMessageAt})`,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.professionalId, professionalId),
        eq(conversations.status, "open"),
        isNull(conversations.deletedAt),
        eq(conversations.lastMessageRole, "seeker"),
        sql`(${conversations.proLastReadAt} IS NULL OR ${conversations.lastMessageAt} > ${conversations.proLastReadAt})`,
      ),
    );
  return { unread: Number(row?.unread || 0), latest: row?.latest || null };
}
