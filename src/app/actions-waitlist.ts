"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { auditLogs, waitlistEntries } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { newId, nowIso } from "@/lib/ids";
import {
  notifyAdminWaitlistEntry,
  notifyWaitlistConfirmation,
} from "@/lib/notifications";
import { getRequesterHash } from "@/lib/requester-hash";
import { waitlistEntrySchema, waitlistStatusSchema } from "@/lib/validation";
import { waitlistSourceLabels } from "@/lib/waitlist";
import { storeWaitlistEntry } from "@/lib/waitlist-store";

export type WaitlistFormState =
  | { ok: true }
  | { ok: false; message: string }
  | null;

const STORE_ERROR_MESSAGE =
  "No pudimos guardar tu anotación. Intenta de nuevo en unos minutos o escríbenos desde la página de contacto.";
const RATE_LIMIT_MESSAGE =
  "Ya recibimos varias anotaciones tuyas hace poco. Espera un rato antes de intentarlo de nuevo.";

/**
 * Anotación en la lista de espera desde el formulario público (apoyo por
 * motivos ajenos al terremoto).
 *
 * Privacidad y antiabuso:
 * - Honeypot silencioso (como el contacto público): si un bot lo rellena,
 *   fingimos éxito sin guardar nada.
 * - El correo de confirmación y el aviso interno son best-effort: la fila ya
 *   quedó guardada y es la fuente de verdad (ver `storeWaitlistEntry`).
 */
export async function createWaitlistEntry(
  _previous: WaitlistFormState,
  formData: FormData,
): Promise<WaitlistFormState> {
  if (String(formData.get("company") ?? "").trim()) return { ok: true };

  const parsed = waitlistEntrySchema.safeParse(
    Object.fromEntries(formData.entries()),
  );
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        "Revisa los datos e inténtalo de nuevo.",
    };
  }
  const { email, title, description, source } = parsed.data;

  try {
    const requesterHash = await getRequesterHash("waitlist_entry");
    const stored = await storeWaitlistEntry({
      email,
      title,
      description,
      source: source === "chat" ? "lista-de-espera" : source,
      requesterHash,
    });
    if (!stored.ok) {
      return {
        ok: false,
        message:
          stored.reason === "rate_limited"
            ? RATE_LIMIT_MESSAGE
            : STORE_ERROR_MESSAGE,
      };
    }

    // Solo la PRIMERA anotación (INSERT) dispara correos: si fue una
    // actualización, no repetimos avisos ni llenamos bandejas.
    if (stored.created) {
      await notifyAdminWaitlistEntry({
        sourceLabel: waitlistSourceLabels[source],
      }).catch(() => undefined);
      await notifyWaitlistConfirmation({ email }).catch(() => undefined);
    }

    revalidatePath("/admin/lista-de-espera");
    return { ok: true };
  } catch {
    return { ok: false, message: STORE_ERROR_MESSAGE };
  }
}

/** Cambia el estado de una anotación desde /admin (con auditoría). */
export async function adminUpdateWaitlistStatus(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;

  const id = String(formData.get("waitlistId") ?? "").trim();
  const parsedStatus = waitlistStatusSchema.safeParse(formData.get("status"));
  if (!id || !parsedStatus.success) return;

  const existing = await db.query.waitlistEntries.findFirst({
    where: eq(waitlistEntries.id, id),
    columns: { id: true, status: true },
  });
  if (!existing || existing.status === parsedStatus.data) return;

  const timestamp = nowIso();
  // D1 no admite transacciones SQL interactivas, pero `db.batch()` ejecuta sus
  // sentencias como una única operación todo-o-nada: el estado y su rastro de
  // auditoría nunca quedan separados.
  await db.batch([
    db.insert(auditLogs).select(
      db
        .select({
          id: sql<string>`${newId("log")}`.as("id"),
          actorEmail: sql<string>`${admin.email}`.as("actor_email"),
          action: sql<string>`${`waitlist_${parsedStatus.data}`}`.as("action"),
          entityType: sql<string>`'waitlist_entry'`.as("entity_type"),
          entityId: waitlistEntries.id,
          metadata: sql<string>`NULL`.as("metadata"),
          createdAt: sql<string>`${timestamp}`.as("created_at"),
        })
        .from(waitlistEntries)
        .where(
          and(
            eq(waitlistEntries.id, id),
            eq(waitlistEntries.status, existing.status),
            isNull(waitlistEntries.anonymizedAt),
          ),
        ),
    ),
    db
      .update(waitlistEntries)
      .set({ status: parsedStatus.data, updatedAt: timestamp })
      .where(
        and(
          eq(waitlistEntries.id, id),
          eq(waitlistEntries.status, existing.status),
          isNull(waitlistEntries.anonymizedAt),
        ),
      ),
  ]);
  revalidatePath("/admin/lista-de-espera");
}
