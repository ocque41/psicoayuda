import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contactMessages, supportReplies } from "@/db/schema";
import type { ContactCategory, ContactStatus } from "@/lib/contact-messages";
import { contactStatuses } from "@/lib/contact-messages";
import {
  type SupportActor,
  type SupportProfessionalActor,
  type SupportStaffActor,
  supportTicketScope,
} from "./support-access";

export const SUPPORT_PAGE_SIZE = 20;
export type SupportListQuery = { page?: string | number; status?: string };
export type SupportRevision = {
  updatedAt: string;
  status: ContactStatus;
  replies: number;
};
export function supportRevision(value: SupportRevision) {
  return JSON.stringify([value.updatedAt, value.status, value.replies]);
}
function requestedPage(value: string | number | undefined, fallback = 1) {
  const text = String(value ?? "");
  return /^\d{1,9}$/.test(text) ? Math.max(1, Number(text)) : fallback;
}
function pagination(total: number, value?: string | number, latest = false) {
  const pageCount = Math.max(1, Math.ceil(total / SUPPORT_PAGE_SIZE));
  const page = Math.min(
    requestedPage(value, latest ? pageCount : 1),
    pageCount,
  );
  return { page, pageCount, total, pageSize: SUPPORT_PAGE_SIZE };
}

async function readList(actor: SupportActor, query: SupportListQuery = {}) {
  const scope = supportTicketScope(actor);
  const [totals] = await db
    .select({
      all: sql<number>`count(*)`,
      new: sql<number>`coalesce(sum(${contactMessages.status} = 'new'), 0)`,
      in_review: sql<number>`coalesce(sum(${contactMessages.status} = 'in_review'), 0)`,
      resolved: sql<number>`coalesce(sum(${contactMessages.status} = 'resolved'), 0)`,
    })
    .from(contactMessages)
    .where(scope);
  const counts = {
    all: Number(totals.all),
    new: Number(totals.new),
    in_review: Number(totals.in_review),
    resolved: Number(totals.resolved),
  };
  const status = contactStatuses.find((value) => value === query.status);
  const meta = pagination(status ? counts[status] : counts.all, query.page);
  const items = await db
    .select({
      id: contactMessages.id,
      category: contactMessages.category,
      source: contactMessages.source,
      status: contactMessages.status,
      createdAt: contactMessages.createdAt,
      updatedAt: contactMessages.updatedAt,
      professionalId: contactMessages.professionalId,
      // Drizzle elimina calificadores en SELECT de tabla única; el literal fijo
      // mantiene la correlación con el ticket y no con support_replies.id.
      replyCount: sql<number>`(SELECT count(*) FROM support_replies WHERE contact_id = ${sql.raw('"contact_messages"."id"')})`,
    })
    .from(contactMessages)
    .where(and(scope, status ? eq(contactMessages.status, status) : undefined))
    .orderBy(desc(contactMessages.updatedAt), desc(contactMessages.id))
    .limit(SUPPORT_PAGE_SIZE)
    .offset((meta.page - 1) * SUPPORT_PAGE_SIZE);
  return { ...meta, counts, status: status ?? "all", items };
}

export function readProfessionalSupportList(
  actor: SupportProfessionalActor,
  query?: SupportListQuery,
) {
  return readList(actor, query);
}
export async function readStaffSupportList(
  actor: SupportStaffActor,
  query?: SupportListQuery,
) {
  const list = await readList(actor, query);
  if (!list.items.length)
    return list as typeof list & {
      items: ((typeof list.items)[number] & { name: string | null })[];
    };
  const names = await db
    .select({ id: contactMessages.id, name: contactMessages.name })
    .from(contactMessages)
    .where(
      and(
        supportTicketScope(actor),
        sql`${contactMessages.id} IN (${sql.join(
          list.items.map((item) => sql`${item.id}`),
          sql`, `,
        )})`,
      ),
    );
  const byId = new Map(names.map((contact) => [contact.id, contact.name]));
  return {
    ...list,
    items: list.items
      .filter((item) => byId.has(item.id))
      .map((item) => ({ ...item, name: byId.get(item.id) ?? null })),
  };
}

async function readThread(
  actor: SupportActor,
  ticketId: string,
  page?: string | number,
) {
  const scope = and(
    eq(contactMessages.id, ticketId),
    supportTicketScope(actor),
  );
  const [header] = await db
    .select({
      id: contactMessages.id,
      source: contactMessages.source,
      category: contactMessages.category,
      status: contactMessages.status,
      professionalId: contactMessages.professionalId,
      createdAt: contactMessages.createdAt,
      updatedAt: contactMessages.updatedAt,
      replies: sql<number>`(SELECT count(*) FROM support_replies WHERE contact_id = ${sql.raw('"contact_messages"."id"')})`,
    })
    .from(contactMessages)
    .where(scope)
    .limit(1);
  if (!header) return null;
  const meta = pagination(Number(header.replies), page, true);
  const [original] = await db
    .select({ body: contactMessages.message })
    .from(contactMessages)
    .where(scope)
    .limit(1);
  if (!original) return null;
  const replies = await db
    .select({
      id: supportReplies.id,
      authorRole: supportReplies.authorRole,
      body: supportReplies.body,
      createdAt: supportReplies.createdAt,
    })
    .from(supportReplies)
    .where(
      and(
        eq(supportReplies.contactId, header.id),
        sql`EXISTS (SELECT 1 FROM contact_messages WHERE ${scope})`,
      ),
    )
    .orderBy(asc(supportReplies.createdAt), asc(supportReplies.id))
    .limit(SUPPORT_PAGE_SIZE)
    .offset((meta.page - 1) * SUPPORT_PAGE_SIZE);
  return {
    ...meta,
    revision: supportRevision({
      updatedAt: header.updatedAt,
      status: header.status as ContactStatus,
      replies: Number(header.replies),
    }),
    ticket: {
      id: header.id,
      category: header.category as ContactCategory,
      status: header.status as ContactStatus,
      source: header.source,
      professionalId: header.professionalId,
      body: original.body,
      createdAt: header.createdAt,
      updatedAt: header.updatedAt,
    },
    replies,
  };
}
export function readSupportThread(
  actor: SupportProfessionalActor,
  ticketId: string,
  page?: string | number,
) {
  return readThread(actor, ticketId, page);
}
export async function readStaffSupportThread(
  actor: SupportStaffActor,
  ticketId: string,
  page?: string | number,
) {
  const thread = await readThread(actor, ticketId, page);
  if (!thread) return null;
  const [contact] = await db
    .select({ name: contactMessages.name, email: contactMessages.email })
    .from(contactMessages)
    .where(and(eq(contactMessages.id, ticketId), supportTicketScope(actor)))
    .limit(1);
  return contact
    ? { ...thread, ticket: { ...thread.ticket, ...contact } }
    : null;
}
