"use server";
import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { auditLogs, practiceCredentials, professionals } from "@/db/schema";
import { releaseProfessionalAssignments } from "@/lib/assignment";
import { countries } from "@/lib/constants";
import { newId, nowIso } from "@/lib/ids";
import { requirePracticeStaff } from "@/lib/practice/staff";
import {
  requireSupportStaff,
  type SupportFormState,
  writeSupportReply,
  writeSupportStatus,
} from "@/lib/practice/support";
export async function replySupport(
  _prev: PracticeFormState,
  form: FormData,
): Promise<SupportFormState> {
  try {
    const staff = await requireSupportStaff();
    if (!staff)
      return {
        ok: false,
        code: "unauthorized",
        message: "Tu cuenta no tiene permiso de soporte.",
      };
    const state = await writeSupportReply(staff, form);
    if (state?.ok) {
      revalidatePath("/admin/operaciones");
      revalidatePath("/pro/soporte");
      const contactId = String(form.get("contactId") ?? "").trim();
      revalidatePath(`/pro/soporte/${contactId}`);
      revalidatePath(`/admin/operaciones/soporte/${contactId}`);
    }
    return state;
  } catch {
    return {
      ok: false,
      code: "unavailable",
      message:
        "No pudimos guardar la respuesta. Conserva el texto y vuelve a intentarlo.",
    };
  }
}
export async function reviewScope(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const staff = await requirePracticeStaff("credentials");
  if (!staff)
    return { ok: false, message: "Tu cuenta no puede verificar credenciales." };
  const parsed = z
    .object({
      professionalId: z.string().min(1),
      country: z
        .string()
        .refine((v) => (countries as readonly string[]).includes(v)),
      registryReference: z.string().trim().min(5).max(300),
      expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      checked: z.literal("on"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      message:
        "Indica el país, referencia de la revisión, próxima fecha de revisión y confirma el cotejo.",
    };
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.id, parsed.data.professionalId),
    columns: { id: true, status: true, nonClinicalHelper: true },
  });
  const expiresAt = `${parsed.data.expiresAt}T23:59:59.999Z`;
  if (
    pro?.status !== "approved" ||
    pro.nonClinicalHelper ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    new Date(expiresAt).toISOString().slice(0, 10) !== parsed.data.expiresAt ||
    Date.parse(expiresAt) <= Date.now() ||
    Date.parse(expiresAt) > Date.now() + 366 * 86400000
  )
    return {
      ok: false,
      message:
        "El ámbito requiere un profesional clínico aprobado y una fecha futura.",
    };
  await db.batch([
    db
      .insert(practiceCredentials)
      .values({
        id: newId("scope"),
        professionalId: pro.id,
        patientCountry: parsed.data.country,
        registryReference: parsed.data.registryReference,
        reviewedBy: staff.email,
        reviewedAt: nowIso(),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [
          practiceCredentials.professionalId,
          practiceCredentials.patientCountry,
        ],
        set: {
          registryReference: parsed.data.registryReference,
          reviewedBy: staff.email,
          reviewedAt: nowIso(),
          expiresAt,
        },
      }),
    db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: staff.email,
      action: "practice_scope_reviewed",
      entityType: "professional",
      entityId: pro.id,
      metadata: JSON.stringify({ country: parsed.data.country }),
      createdAt: nowIso(),
    }),
  ]);
  revalidatePath("/admin/operaciones");
  revalidatePath("/orientacion");
  return {
    ok: true,
    message:
      "Ámbito de atención revisado. Ya puede participar en las recomendaciones para ese país.",
  };
}

export async function reviewProfessional(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const staff = await requirePracticeStaff("credentials");
  if (!staff)
    return { ok: false, message: "Tu cuenta no puede revisar credenciales." };
  const parsed = z
    .object({
      professionalId: z.string().min(1),
      status: z.enum([
        "approved",
        "pending_verification",
        "suspended",
        "rejected",
      ]),
      reference: z.string().trim().min(5).max(300),
      checked: z.literal("on"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      message: "Completa la decisión y el cotejo documental.",
    };
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.id, parsed.data.professionalId),
  });
  if (!pro || pro.nonClinicalHelper)
    return {
      ok: false,
      message: "Esta revisión es para profesionales clínicos.",
    };
  if (pro.status === "deleting")
    return {
      ok: false,
      message:
        "Este perfil está en proceso de eliminación y no admite nuevas decisiones. Reintenta su eliminación desde la cuenta.",
    };
  const timestamp = nowIso();
  const results = await db.batch([
    db
      .update(professionals)
      .set({
        status: parsed.data.status,
        credentialConfirmed: parsed.data.status === "approved",
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(professionals.id, pro.id),
          ne(professionals.status, "deleting"),
          eq(professionals.nonClinicalHelper, false),
        ),
      )
      .returning({ id: professionals.id }),
    // La decisión y su auditoría comparten transacción: una baja que gane la
    // carrera no genera una aprobación ficticia ni reabre el perfil.
    db.insert(auditLogs).select(
      sql`SELECT ${newId("log")},${staff.email},'practice_credential_decision','professional',${pro.id},${JSON.stringify(
        {
          status: parsed.data.status,
          reference: parsed.data.reference,
        },
      )},${timestamp} WHERE changes()=1`,
    ),
  ]);
  if (!results[0].length)
    return {
      ok: false,
      message:
        "El perfil cambió o inició su eliminación antes de guardar. Actualiza la revisión para comprobar su estado.",
    };
  if (parsed.data.status !== "approved")
    await releaseProfessionalAssignments(pro.id);
  revalidateTag("professionals", { expire: 0 });
  revalidatePath("/admin/operaciones");
  revalidatePath("/profesionales");
  revalidatePath("/orientacion");
  return {
    ok: true,
    message:
      "Decisión guardada. Revisa también los ámbitos por país y sus fechas de vigencia.",
  };
}

export async function revokeScope(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const staff = await requirePracticeStaff("credentials");
  if (!staff)
    return { ok: false, message: "Tu cuenta no puede revisar credenciales." };
  const id = String(form.get("scopeId") || "");
  const reason = z
    .string()
    .trim()
    .min(5)
    .max(300)
    .safeParse(form.get("reason"));
  if (!reason.success)
    return { ok: false, message: "Registra el motivo de retirar este ámbito." };
  const scope = await db.query.practiceCredentials.findFirst({
    where: eq(practiceCredentials.id, id),
  });
  if (!scope) return { ok: false, message: "No encontramos este ámbito." };
  await db.batch([
    db
      .update(practiceCredentials)
      .set({ expiresAt: nowIso() })
      .where(eq(practiceCredentials.id, id)),
    db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: staff.email,
      action: "practice_scope_revoked",
      entityType: "professional",
      entityId: scope.professionalId,
      metadata: JSON.stringify({
        country: scope.patientCountry,
        reason: reason.data,
      }),
      createdAt: nowIso(),
    }),
  ]);
  revalidatePath("/admin/operaciones");
  revalidatePath("/orientacion");
  return {
    ok: true,
    message:
      "Ámbito retirado de las recomendaciones. Su revisión queda en el historial.",
  };
}
export async function updateSupportStatus(
  _prev: PracticeFormState,
  form: FormData,
): Promise<SupportFormState> {
  try {
    const staff = await requireSupportStaff();
    if (!staff)
      return {
        ok: false,
        code: "unauthorized",
        message: "Tu cuenta no tiene permiso de soporte.",
      };
    const state = await writeSupportStatus(staff, form);
    if (state?.ok) {
      revalidatePath("/admin/operaciones");
      revalidatePath("/pro/soporte");
      const contactId = String(form.get("contactId") ?? "").trim();
      revalidatePath(`/pro/soporte/${contactId}`);
      revalidatePath(`/admin/operaciones/soporte/${contactId}`);
    }
    return state;
  } catch {
    return {
      ok: false,
      code: "unavailable",
      message: "No pudimos guardar el estado. Vuelve a intentarlo.",
    };
  }
}
