"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { auditLogs, partners } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { newId, nowIso } from "@/lib/ids";
import { partnerSchema } from "@/lib/validation";

function formEntries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

// Revalida las vistas donde aparecen los aliados tras un cambio del admin.
function revalidatePartnerViews() {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/alianzas");
}

/**
 * Crea o edita un aliado (carrusel/escaparate). Con `id` actualiza; sin `id`
 * inserta. Se usa con useActionState desde el panel para mostrar el mensaje.
 */
export async function adminSavePartner(
  _prevState: unknown,
  formData: FormData,
) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const parsed = partnerSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return {
      ok: false as const,
      message:
        parsed.error.issues[0]?.message ??
        "Revisa los datos e inténtalo de nuevo.",
    };
  }

  const data = parsed.data;
  const timestamp = nowIso();
  const id = data.id?.trim() || newId("partner");
  const values = {
    name: data.name,
    specialty: data.specialty || null,
    description: data.description || null,
    logo: data.logo || null,
    contacts: JSON.stringify(data.contacts),
    status: data.status,
    sortOrder: data.sortOrder,
    updatedAt: timestamp,
  };

  if (data.id?.trim()) {
    await db.update(partners).set(values).where(eq(partners.id, id));
  } else {
    await db.insert(partners).values({ ...values, id, createdAt: timestamp });
  }

  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: data.id?.trim() ? "partner_update" : "partner_create",
    entityType: "partner",
    entityId: id,
    createdAt: timestamp,
  });

  revalidatePartnerViews();
  return {
    ok: true as const,
    message: data.id?.trim() ? "Aliado actualizado." : "Aliado creado.",
  };
}

/** Elimina un aliado. Acción de formulario simple (con confirmación en el panel). */
export async function adminDeletePartner(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) redirect("/pro");

  const id = String(formData.get("partnerId") ?? "").trim();
  if (!id) redirect("/admin");

  await db.delete(partners).where(eq(partners.id, id));
  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: "partner_delete",
    entityType: "partner",
    entityId: id,
    createdAt: nowIso(),
  });

  revalidatePartnerViews();
}
