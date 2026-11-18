import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { professionalMemberships, professionals } from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  MEMBERSHIP_ACCESS_STATUSES,
  suggestedMembershipCurrency,
} from "@/lib/practice/membership-plan";
import { sendPlanEmail } from "@/lib/practice/plan-emails";

/**
 * Paso de perfiles anteriores ("legacy") al plan de suscripción. Preparado
 * para dispararse desde /admin/planes cuando el equipo lo decida:
 *
 * - Solo cambia `access_plan` (y su fecha). No borra ni toca pacientes,
 *   notas, agenda, conversaciones ni historial.
 * - Envía a cada perfil el correo con el enlace directo para pagar y volver.
 * - Se niega a ejecutarse con los cobros del software apagados, para no
 *   mandar un enlace de pago que todavía no funciona.
 * - Es reversible por perfil (`revertToLegacy`).
 */
export class PlanMigrationError extends Error {}

const clinicalApproved = and(
  eq(professionals.status, "approved"),
  eq(professionals.nonClinicalHelper, false),
);

export async function listPlanProfessionals() {
  return db
    .select({
      id: professionals.id,
      name: professionals.fullName,
      displayName: professionals.displayName,
      email: professionals.email,
      country: professionals.country,
      accessPlan: professionals.accessPlan,
      accessPlanChangedAt: professionals.accessPlanChangedAt,
      membershipStatus: professionalMemberships.status,
      membershipPlan: professionalMemberships.plan,
    })
    .from(professionals)
    .leftJoin(
      professionalMemberships,
      eq(professionalMemberships.professionalId, professionals.id),
    )
    .where(clinicalApproved)
    .orderBy(asc(professionals.fullName), asc(professionals.id))
    .limit(500);
}

export async function migrateToSubscription(ids: string[] | "all") {
  if (!membershipBillingReady())
    throw new PlanMigrationError(
      "Activa primero los cobros del software (Stripe y NIDO_MEMBERSHIP_BILLING_ENABLED). Sin ellos, el correo llevaría a un pago que aún no funciona.",
    );
  if (ids !== "all" && ids.length === 0) return { moved: 0, emailed: 0 };
  const timestamp = nowIso();
  const moved = await db
    .update(professionals)
    .set({ accessPlan: "subscription", accessPlanChangedAt: timestamp })
    .where(
      and(
        clinicalApproved,
        eq(professionals.accessPlan, "legacy"),
        ids === "all" ? undefined : inArray(professionals.id, ids),
      ),
    )
    .returning({
      id: professionals.id,
      email: professionals.email,
      name: professionals.displayName,
      fullName: professionals.fullName,
      country: professionals.country,
    });
  let emailed = 0;
  for (const pro of moved) {
    const result = await sendPlanEmail("migration", {
      email: pro.email,
      name: pro.name || pro.fullName,
      currency: suggestedMembershipCurrency(pro.country),
    }).catch(() => ({ ok: false }));
    if (result.ok) emailed++;
  }
  return { moved: moved.length, emailed };
}

/** Reenvía el correo a quien está en suscripción y aún no tiene plan vigente. */
export async function resendPaymentEmail(id: string) {
  if (!membershipBillingReady())
    throw new PlanMigrationError(
      "Los cobros del software están desactivados: el enlace aún no permite pagar.",
    );
  const [pro] = await db
    .select({
      email: professionals.email,
      name: professionals.displayName,
      fullName: professionals.fullName,
      country: professionals.country,
    })
    .from(professionals)
    .where(
      and(
        clinicalApproved,
        eq(professionals.id, id),
        eq(professionals.accessPlan, "subscription"),
        sql`NOT EXISTS (SELECT 1 FROM professional_memberships m WHERE m.professional_id = ${professionals.id} AND m.status IN (${sql.join(
          MEMBERSHIP_ACCESS_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )}))`,
      ),
    )
    .limit(1);
  if (!pro) return false;
  const result = await sendPlanEmail("migration", {
    email: pro.email,
    name: pro.name || pro.fullName,
    currency: suggestedMembershipCurrency(pro.country),
  });
  return result.ok;
}

/** Devuelve un perfil al acceso anterior (sin cobro), p. ej. por una excepción. */
export async function revertToLegacy(id: string) {
  const rows = await db
    .update(professionals)
    .set({ accessPlan: "legacy", accessPlanChangedAt: nowIso() })
    .where(and(clinicalApproved, eq(professionals.id, id)))
    .returning({ id: professionals.id });
  return rows.length > 0;
}
