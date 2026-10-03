import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contactMessages, supportReplies } from "@/db/schema";
import { contactStatuses } from "@/lib/contact-messages";
import { newId, nowIso } from "@/lib/ids";
import {
  type SupportActor,
  type SupportStaffActor,
  supportTicketScope,
} from "./support-access";
import type { SupportRevision } from "./support-queries";

export const SUPPORT_REPLY_LIMIT_PER_HOUR = 20;
export type SupportFormState = {
  ok: boolean;
  message: string;
  code?:
    | "validation"
    | "unauthorized"
    | "not_found"
    | "conflict"
    | "rate_limit"
    | "unavailable";
  replyId?: string;
  revision?: string;
} | null;

const replyInput = z.object({
  contactId: z.string().trim().min(1).max(200),
  body: z.string().trim().min(3).max(2000),
  submissionId: z.uuid(),
});
const revisionInput = z.tuple([
  z.string().min(1).max(64),
  z.enum(contactStatuses),
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
]);
function revisionFrom(
  value: FormDataEntryValue | null,
): SupportRevision | null {
  if (typeof value !== "string" || value.length > 200) return null;
  try {
    const parsed = revisionInput.safeParse(JSON.parse(value));
    return parsed.success
      ? {
          updatedAt: parsed.data[0],
          status: parsed.data[1],
          replies: parsed.data[2],
        }
      : null;
  } catch {
    return null;
  }
}
function conflict(): SupportFormState {
  return {
    ok: false,
    code: "conflict",
    message:
      "Llegaron cambios a esta consulta. Actualiza el historial antes de responder o cambiar su estado.",
  };
}
function unavailable(): SupportFormState {
  return {
    ok: false,
    code: "unavailable",
    message:
      "No pudimos guardar el cambio. Conserva tu mensaje y vuelve a intentarlo.",
  };
}
function currentRevision(actor: SupportActor, contactId: string) {
  return db
    .select({
      id: contactMessages.id,
      source: contactMessages.source,
      professionalId: contactMessages.professionalId,
      updatedAt: contactMessages.updatedAt,
      status: contactMessages.status,
      replies: sql<number>`(SELECT count(*) FROM support_replies WHERE contact_id = ${sql.raw('"contact_messages"."id"')})`,
    })
    .from(contactMessages)
    .where(and(eq(contactMessages.id, contactId), supportTicketScope(actor)))
    .limit(1);
}
function sameRevision(
  value: { updatedAt: string; status: string; replies: number },
  expected: SupportRevision,
) {
  return (
    value.updatedAt === expected.updatedAt &&
    value.status === expected.status &&
    Number(value.replies) === expected.replies
  );
}
function revisionCondition(expected: SupportRevision) {
  return sql`${contactMessages.updatedAt} = ${expected.updatedAt}
    AND ${contactMessages.status} = ${expected.status}
    AND (SELECT count(*) FROM support_replies WHERE contact_id = ${contactMessages.id}) = ${expected.replies}`;
}
async function existingSubmission(actor: SupportActor, submissionId: string) {
  const [existing] = await db
    .select({
      id: supportReplies.id,
      contactId: supportReplies.contactId,
      body: supportReplies.body,
    })
    .from(supportReplies)
    .where(
      and(
        eq(
          supportReplies.authorRole,
          actor.kind === "staff" ? "staff" : "professional",
        ),
        eq(supportReplies.actorUserId, actor.userId),
        eq(supportReplies.submissionId, submissionId),
      ),
    )
    .limit(1);
  return existing;
}

/** INSERT, estado y auditoría son una sola transacción; reintentar no los repite. */
export async function writeSupportReply(
  actor: SupportActor,
  form: FormData,
): Promise<SupportFormState> {
  const parsed = replyInput.safeParse(Object.fromEntries(form));
  const staffStatus =
    actor.kind === "staff"
      ? z.enum(["in_review", "resolved"]).safeParse(form.get("status"))
      : null;
  const expected =
    actor.kind === "staff" ? revisionFrom(form.get("revision")) : null;
  if (
    !parsed.success ||
    (actor.kind === "staff" && (!staffStatus?.success || !expected))
  )
    return {
      ok: false,
      code: "validation",
      message:
        "Escribe una respuesta de 3 a 2000 caracteres y actualiza la consulta antes de enviarla.",
    };
  const input = parsed.data;
  try {
    const [ticket] = await currentRevision(actor, input.contactId);
    if (!ticket)
      return {
        ok: false,
        code: "not_found",
        message: "Esta consulta no está disponible para tu cuenta.",
      };
    if (!ticket.professionalId || ticket.source !== "professional_dashboard")
      return {
        ok: false,
        code: "validation",
        message:
          "Las consultas públicas se responden por correo desde su ficha.",
      };
    const existing = await existingSubmission(actor, input.submissionId);
    if (existing)
      return existing.contactId === ticket.id && existing.body === input.body
        ? {
            ok: true,
            message: "Tu respuesta ya estaba guardada.",
            replyId: existing.id,
          }
        : {
            ok: false,
            code: "conflict",
            message:
              "Este envío ya se usó para otro mensaje. Actualiza la consulta antes de enviar.",
          };
    if (expected && !sameRevision(ticket, expected)) return conflict();

    const id = newId("reply");
    const timestamp = nowIso();
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const role = actor.kind === "staff" ? "staff" : "professional";
    const action =
      actor.kind === "staff" ? "support_reply" : "support_professional_reply";
    const desiredStatus = staffStatus?.success ? staffStatus.data : null;
    const insert = db.all(sql`INSERT INTO support_replies
      (id, contact_id, body, author_email, author_role, actor_user_id, submission_id, created_at)
      SELECT ${id}, ${ticket.id}, ${input.body}, ${actor.email}, ${role}, ${actor.userId}, ${input.submissionId}, ${timestamp}
      FROM contact_messages
      WHERE ${contactMessages.id} = ${ticket.id} AND ${supportTicketScope(actor)}
        AND EXISTS (SELECT 1 FROM professionals WHERE id = ${contactMessages.professionalId} AND status <> 'deleting')
        AND ${expected ? revisionCondition(expected) : sql`1 = 1`}
        AND NOT EXISTS (SELECT 1 FROM support_replies WHERE author_role = ${role} AND actor_user_id = ${actor.userId} AND submission_id = ${input.submissionId})
        AND (SELECT count(*) FROM support_replies WHERE author_role = ${role} AND actor_user_id = ${actor.userId} AND created_at >= ${since}) < ${SUPPORT_REPLY_LIMIT_PER_HOUR}
      RETURNING id`);
    const audit =
      db.run(sql`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, created_at)
      SELECT ${newId("log")}, ${actor.email}, ${action}, 'contact_message', ${ticket.id}, ${timestamp}
      WHERE EXISTS (SELECT 1 FROM support_replies WHERE id = ${id})`);
    const statements = desiredStatus
      ? ([
          insert,
          audit,
          db.run(sql`UPDATE contact_messages SET status = ${desiredStatus}, handled_by = ${actor.email}, handled_at = ${timestamp},
            updated_at = max(${timestamp}, coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), ${timestamp}))
          WHERE ${contactMessages.id} = ${ticket.id} AND EXISTS (SELECT 1 FROM support_replies WHERE id = ${id})`),
        ] as const)
      : ([insert, audit] as const);
    const [inserted] = await db.batch(statements);
    if (!inserted.length) {
      const retried = await existingSubmission(actor, input.submissionId);
      if (retried)
        return retried.contactId === ticket.id && retried.body === input.body
          ? {
              ok: true,
              message: "Tu respuesta ya estaba guardada.",
              replyId: retried.id,
            }
          : conflict();
      const [current] = await currentRevision(actor, ticket.id);
      if (!current)
        return {
          ok: false,
          code: "not_found",
          message: "Esta consulta no está disponible para tu cuenta.",
        };
      if (expected && !sameRevision(current, expected)) return conflict();
      return {
        ok: false,
        code: "rate_limit",
        message:
          "Ya guardamos varias respuestas tuyas en la última hora. Espera un poco antes de enviar otra.",
      };
    }
    return {
      ok: true,
      message:
        actor.kind === "staff"
          ? "Respuesta publicada en el soporte del profesional."
          : "Respuesta guardada. El equipo podrá continuar esta consulta.",
      replyId: id,
    };
  } catch {
    return unavailable();
  }
}

export async function writeSupportStatus(
  actor: SupportStaffActor,
  form: FormData,
): Promise<SupportFormState> {
  const parsed = z
    .object({
      contactId: z.string().trim().min(1).max(200),
      status: z.enum(contactStatuses),
    })
    .safeParse(Object.fromEntries(form));
  const expected = revisionFrom(form.get("revision"));
  if (!parsed.success || !expected)
    return {
      ok: false,
      code: "validation",
      message: "Actualiza la consulta y elige su estado.",
    };
  try {
    const [ticket] = await currentRevision(actor, parsed.data.contactId);
    if (!ticket)
      return {
        ok: false,
        code: "not_found",
        message: "No encontramos esta consulta.",
      };
    if (!sameRevision(ticket, expected)) return conflict();
    if (ticket.status === parsed.data.status)
      return { ok: true, message: "La consulta ya tiene ese estado." };
    const timestamp = nowIso();
    const auditId = newId("log");
    const [changed] = await db.batch([
      db.all(sql`UPDATE contact_messages SET status = ${parsed.data.status},
        handled_by = ${parsed.data.status === "new" ? null : actor.email},
        handled_at = ${parsed.data.status === "new" ? null : timestamp},
        updated_at = max(${timestamp}, coalesce(strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds'), ${timestamp}))
        WHERE ${contactMessages.id} = ${ticket.id} AND ${supportTicketScope(actor)} AND ${revisionCondition(expected)}
        RETURNING id`),
      db.run(sql`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, metadata, created_at)
        SELECT ${auditId}, ${actor.email}, 'support_status_updated', 'contact_message', ${ticket.id}, ${JSON.stringify({ status: parsed.data.status })}, ${timestamp}
        WHERE changes() > 0`),
    ]);
    return changed.length
      ? { ok: true, message: "Estado guardado." }
      : conflict();
  } catch {
    return unavailable();
  }
}
