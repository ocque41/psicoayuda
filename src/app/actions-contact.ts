"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, contactMessages } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import {
  type ContactCategory,
  type ContactSource,
  contactCategoryLabels,
  contactSourceLabels,
  PROFESSIONAL_CONTACT_LIMIT_PER_HOUR,
  PUBLIC_CONTACT_LIMIT_PER_HOUR,
  professionalContactFormInput,
} from "@/lib/contact-messages";
import { newId, nowIso } from "@/lib/ids";
import { notifyAdminContactMessage } from "@/lib/notifications";
import { requireSupportProfessional } from "@/lib/practice/support-access";
import { getRequesterHash } from "@/lib/requester-hash";
import { contactMessageSchema, contactStatusSchema } from "@/lib/validation";

export type ContactFormState =
  | { ok: true }
  | { ok: false; message: string }
  | null;

function formEntries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function storeContactWithinRateLimit(input: {
  source: ContactSource;
  category: ContactCategory;
  name?: string;
  email: string;
  professionalId?: string;
  actorUserId?: string;
  message: string;
  requesterHash?: string;
}) {
  const id = newId("contact");
  const timestamp = nowIso();
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const limit =
    input.source === "public_contact"
      ? PUBLIC_CONTACT_LIMIT_PER_HOUR
      : PROFESSIONAL_CONTACT_LIMIT_PER_HOUR;
  const rateCondition =
    input.source === "public_contact"
      ? input.requesterHash
        ? sql`source = 'public_contact' AND (email = ${input.email} OR requester_hash = ${input.requesterHash})`
        : sql`source = 'public_contact' AND email = ${input.email}`
      : sql`source = 'professional_dashboard' AND professional_id = ${input.professionalId ?? ""}`;

  const identityCondition =
    input.source === "professional_dashboard"
      ? sql`EXISTS (SELECT 1 FROM professionals AS contact_pro JOIN user AS contact_actor ON contact_actor.id = contact_pro.user_id
       WHERE contact_pro.id = ${input.professionalId ?? ""} AND contact_pro.user_id = ${input.actorUserId ?? ""}
         AND contact_pro.status <> 'deleting' AND lower(contact_actor.email) = lower(${input.email}))`
      : sql`1 = 1`;

  // La comprobación y el INSERT viven en UNA sentencia SQLite. D1 serializa la
  // escritura de la sentencia completa, así que varios envíos paralelos no
  // pueden pasar todos por un conteo antiguo. `RETURNING` queda vacío cuando se
  // alcanzó el límite. Además, cada origen cuenta por separado.
  const inserted = await db.all(
    sql`INSERT INTO contact_messages (
      id, source, category, name, email, professional_id, message, status,
      requester_hash, created_at, updated_at
    )
    SELECT
      ${id}, ${input.source}, ${input.category}, ${input.name ?? null},
      ${input.email}, ${input.professionalId ?? null}, ${input.message}, 'new',
      ${input.requesterHash ?? null}, ${timestamp}, ${timestamp}
    WHERE ${identityCondition} AND (
      SELECT COUNT(*)
      FROM contact_messages
      WHERE ${rateCondition} AND created_at >= ${since}
    ) < ${limit}
    RETURNING id`,
  );

  if (inserted.length === 0) return false;

  await notifyAdminContactMessage({
    sourceLabel: contactSourceLabels[input.source],
    categoryLabel: contactCategoryLabels[input.category],
  }).catch(() => undefined);
  revalidatePath("/admin");
  revalidatePath("/admin/operaciones");
  if (input.source === "professional_dashboard") revalidatePath("/pro/soporte");
  return true;
}

export async function createPublicContactMessage(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  if (String(formData.get("company") ?? "").trim()) return { ok: true };

  const parsed = contactMessageSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Revisa el mensaje e inténtalo de nuevo.",
    };
  }

  try {
    const requesterHash = await getRequesterHash("contact_message");
    const stored = await storeContactWithinRateLimit({
      source: "public_contact",
      ...parsed.data,
      requesterHash,
    });
    if (!stored) {
      return {
        ok: false,
        message:
          "Ya recibimos varios mensajes recientes. Para evitar duplicados, espera un poco antes de enviar otro.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos guardar tu mensaje. Intenta de nuevo en unos minutos o escríbenos por correo.",
    };
  }
}

export async function createProfessionalContactMessage(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  try {
    const actor = await requireSupportProfessional();
    if (!actor)
      return {
        ok: false,
        message:
          "Tu sesión terminó o tu perfil ya no está disponible. Entra de nuevo.",
      };

    const parsed = contactMessageSchema.safeParse(
      professionalContactFormInput(formEntries(formData), {
        name: actor.displayName,
        email: actor.email,
      }),
    );
    if (!parsed.success) {
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message ??
          "Revisa el mensaje e inténtalo de nuevo.",
      };
    }

    const stored = await storeContactWithinRateLimit({
      source: "professional_dashboard",
      ...parsed.data,
      professionalId: actor.professionalId,
      actorUserId: actor.userId,
    });
    if (!stored) {
      return {
        ok: false,
        message:
          "Ya recibimos varios mensajes tuyos o tu perfil cambió. Actualiza la página y espera un poco antes de enviar otro.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos guardar tu mensaje. Intenta de nuevo en unos minutos o escríbenos por correo.",
    };
  }
}

export async function adminUpdateContactMessageStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;

  const id = String(formData.get("contactMessageId") ?? "").trim();
  const parsedStatus = contactStatusSchema.safeParse(formData.get("status"));
  if (!id || !parsedStatus.success) return;

  const existing = await db.query.contactMessages.findFirst({
    where: eq(contactMessages.id, id),
    columns: { id: true, status: true, source: true },
  });
  if (!existing) return;
  // El buzón antiguo no puede resolver una conversación cuya revisión no leyó.
  if (existing.source === "professional_dashboard")
    redirect(`/admin/operaciones/soporte/${id}`);
  if (existing.status === parsedStatus.data) return;

  const timestamp = nowIso();
  // D1 no admite transacciones SQL interactivas, pero `db.batch()` sí ejecuta
  // sus sentencias como una única operación todo-o-nada. Así el estado y su
  // rastro de auditoría nunca pueden quedar separados.
  await db.batch([
    db
      .update(contactMessages)
      .set({
        status: parsedStatus.data,
        handledBy: parsedStatus.data === "new" ? null : admin.email,
        handledAt: parsedStatus.data === "new" ? null : timestamp,
        updatedAt: timestamp,
      })
      .where(eq(contactMessages.id, id)),
    db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: admin.email,
      action: `contact_message_${parsedStatus.data}`,
      entityType: "contact_message",
      entityId: id,
      createdAt: timestamp,
    }),
  ]);
  revalidatePath("/admin");
}
