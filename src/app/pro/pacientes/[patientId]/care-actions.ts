"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { careCycles, carePlans, practiceServices } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import {
  ownedPatient,
  requirePracticeProfessional,
} from "@/lib/practice/access";
export async function proposeCare(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const patient = await ownedPatient(
    String(form.get("patientId") || ""),
    pro.id,
  );
  if (
    !patient ||
    patient.program === "earthquake" ||
    patient.status === "closed"
  )
    return {
      ok: false,
      message: "Este programa no permite crear acuerdos de cobro.",
    };
  const service = await db.query.practiceServices.findFirst({
    where: and(
      eq(practiceServices.id, String(form.get("serviceId") || "")),
      eq(practiceServices.professionalId, pro.id),
      eq(practiceServices.active, true),
    ),
  });
  if (!service) return { ok: false, message: "Elige un servicio activo." };
  await db.insert(carePlans).values({
    id: newId("care"),
    patientId: patient.id,
    professionalId: pro.id,
    serviceId: service.id,
    title: service.title,
    sessionsCount: service.sessionsCount,
    durationMinutes: service.durationMinutes,
    priceCents: service.priceCents,
    currency: service.currency,
    interval: service.interval,
    validityDays: service.validityDays,
    createdAt: nowIso(),
  });
  revalidatePath(`/pro/pacientes/${patient.id}`);
  return {
    ok: true,
    message:
      "Acuerdo creado. Comparte su enlace desde esta ficha para que el paciente revise las condiciones.",
  };
}
export async function confirmExternalCycle(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  const plan = await db.query.carePlans.findFirst({
    where: and(
      eq(carePlans.id, String(form.get("carePlanId") || "")),
      eq(carePlans.professionalId, pro.id),
    ),
  });
  if (
    !plan ||
    plan.stripeSubscriptionId ||
    plan.checkoutId ||
    plan.status === "needs_review"
  )
    return {
      ok: false,
      message:
        "Este acuerdo no permite confirmar un ciclo externo. Las suscripciones con tarjeta se confirman por el proveedor.",
    };
  const reference = z
    .string()
    .trim()
    .min(3)
    .max(80)
    .safeParse(form.get("reference"));
  if (!reference.success || form.get("confirmed") !== "on")
    return {
      ok: false,
      message:
        "Indica una referencia y confirma que recibiste el pago del ciclo.",
    };
  const timestamp = nowIso();
  try {
    await db.batch([
      db.insert(careCycles).values({
        id: newId("cycle"),
        carePlanId: plan.id,
        externalReference: `external:${pro.id}:${reference.data}`,
        startsAt: timestamp,
        endsAt: new Date(
          Date.now() + plan.validityDays * 86400000,
        ).toISOString(),
        sessionsCount: plan.sessionsCount,
        amountCents: plan.priceCents,
        currency: plan.currency,
        createdAt: timestamp,
      }),
      db
        .update(carePlans)
        .set({ status: "active" })
        .where(eq(carePlans.id, plan.id)),
    ]);
  } catch {
    return {
      ok: false,
      message:
        "No pudimos confirmar el ciclo. Revisa si la referencia ya existe.",
    };
  }
  revalidatePath(`/pro/pacientes/${plan.patientId}`);
  return {
    ok: true,
    message:
      "Ciclo externo confirmado. Las sesiones incluidas ya se pueden programar.",
  };
}
