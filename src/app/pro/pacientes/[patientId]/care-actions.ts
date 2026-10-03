"use server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import {
  auditLogs,
  careCycles,
  carePlans,
  practicePatients,
  practiceServices,
  professionals,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import {
  ownedPatient,
  requirePracticeProfessional,
} from "@/lib/practice/access";
import { currentPracticeActor } from "@/lib/practice/mutation-guard";

function auditChanged(
  pro: { id: string; userId: string; email: string },
  action: string,
  entityId: string,
) {
  return db.insert(auditLogs).select(
    db
      .select({
        id: sql<string>`${newId("log")}`.as("id"),
        actorEmail: sql<string>`${pro.email}`.as("actor_email"),
        action: sql<string>`${action}`.as("action"),
        entityType: sql<string>`'practice'`.as("entity_type"),
        entityId: sql<string>`${entityId}`.as("entity_id"),
        metadata: sql<null>`NULL`.as("metadata"),
        createdAt: sql<string>`${nowIso()}`.as("created_at"),
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.id, pro.id),
          currentPracticeActor(pro.id, pro.userId),
          sql`changes() > 0`,
        ),
      ),
  );
}
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
  const id = newId("care");
  const [saved] = await db.batch([
    db
      .insert(carePlans)
      .select(
        db
          .select({
            id: sql<string>`${id}`.as("id"),
            patientId: practicePatients.id,
            professionalId: professionals.id,
            serviceId: practiceServices.id,
            title: practiceServices.title,
            sessionsCount: practiceServices.sessionsCount,
            durationMinutes: practiceServices.durationMinutes,
            priceCents: practiceServices.priceCents,
            currency: practiceServices.currency,
            interval: practiceServices.interval,
            validityDays: practiceServices.validityDays,
            status: sql<string>`'proposed'`.as("status"),
            stripeSubscriptionId: sql<null>`NULL`.as("stripe_subscription_id"),
            stripeCustomerId: sql<null>`NULL`.as("stripe_customer_id"),
            checkoutId: sql<null>`NULL`.as("checkout_id"),
            createdAt: sql<string>`${nowIso()}`.as("created_at"),
          })
          .from(professionals)
          .innerJoin(
            practicePatients,
            eq(practicePatients.professionalId, professionals.id),
          )
          .innerJoin(
            practiceServices,
            eq(practiceServices.professionalId, professionals.id),
          )
          .where(
            and(
              eq(professionals.id, pro.id),
              currentPracticeActor(pro.id, pro.userId),
              eq(practicePatients.id, patient.id),
              eq(practicePatients.program, "general"),
              ne(practicePatients.status, "closed"),
              eq(practicePatients.updatedAt, patient.updatedAt),
              eq(practiceServices.id, service.id),
              eq(practiceServices.active, true),
              eq(practiceServices.title, service.title),
              eq(practiceServices.sessionsCount, service.sessionsCount),
              eq(practiceServices.durationMinutes, service.durationMinutes),
              eq(practiceServices.priceCents, service.priceCents),
              eq(practiceServices.currency, service.currency),
              eq(practiceServices.interval, service.interval),
              eq(practiceServices.validityDays, service.validityDays),
            ),
          ),
      )
      .returning({ id: carePlans.id }),
    auditChanged(pro, "care_plan_proposed", id),
  ]);
  if (!saved.length)
    return {
      ok: false,
      message:
        "La ficha, el servicio o tu consulta cambió. Actualiza la página antes de crear el acuerdo.",
    };
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
  const cycleId = newId("cycle");
  const eligible = and(
    eq(carePlans.id, plan.id),
    eq(carePlans.professionalId, pro.id),
    currentPracticeActor(pro.id, pro.userId),
    eq(carePlans.patientId, plan.patientId),
    eq(carePlans.status, plan.status),
    ne(carePlans.status, "needs_review"),
    isNull(carePlans.stripeSubscriptionId),
    isNull(carePlans.checkoutId),
    sql`${carePlans.stripeCustomerId} IS ${plan.stripeCustomerId}`,
    eq(carePlans.sessionsCount, plan.sessionsCount),
    eq(carePlans.priceCents, plan.priceCents),
    eq(carePlans.currency, plan.currency),
    eq(carePlans.validityDays, plan.validityDays),
    sql`EXISTS (SELECT 1 FROM practice_patients patient WHERE patient.id=${carePlans.patientId} AND patient.professional_id=${pro.id} AND patient.program='general')`,
  );
  try {
    const [saved, , activated] = await db.batch([
      db
        .insert(careCycles)
        .select(
          db
            .select({
              id: sql<string>`${cycleId}`.as("id"),
              carePlanId: carePlans.id,
              externalReference:
                sql<string>`${`external:${pro.id}:${reference.data}`}`.as(
                  "external_reference",
                ),
              startsAt: sql<string>`${timestamp}`.as("starts_at"),
              endsAt:
                sql<string>`${new Date(Date.parse(timestamp) + plan.validityDays * 86400000).toISOString()}`.as(
                  "ends_at",
                ),
              sessionsCount: carePlans.sessionsCount,
              amountCents: carePlans.priceCents,
              currency: carePlans.currency,
              status: sql<string>`'paid'`.as("status"),
              createdAt: sql<string>`${timestamp}`.as("created_at"),
            })
            .from(carePlans)
            .where(eligible),
        )
        .returning({ id: careCycles.id }),
      auditChanged(pro, "care_external_cycle_confirmed", cycleId),
      db
        .update(carePlans)
        .set({ status: "active" })
        .where(
          and(
            eligible,
            sql`EXISTS (SELECT 1 FROM care_cycles cycle WHERE cycle.id=${cycleId} AND cycle.care_plan_id=${carePlans.id})`,
          ),
        )
        .returning({ id: carePlans.id }),
    ]);
    if (!saved.length || !activated.length)
      return {
        ok: false,
        message:
          "El acuerdo o tu consulta cambió mientras guardabas. Actualiza la página antes de confirmar el ciclo.",
      };
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
