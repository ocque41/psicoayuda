import "server-only";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { professionalMemberships, professionals } from "@/db/schema";
import { getAdminEmails } from "@/lib/admin";
import { nowIso } from "@/lib/ids";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  existingProfessionalTrialEnd,
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
 * - Abre 90 días de prueba gratuita con acceso completo. Si un perfil vuelve
 *   al plan anterior y se le pasa otra vez, conserva la fecha de su primera
 *   prueba (no se reinicia).
 * - No envía correo: el aviso es la barra fija del espacio profesional
 *   (`TrialBar`), con los días que quedan y el botón para añadir el pago.
 * - El equipo (ADMIN_EMAILS) nunca pasa a suscripción: conserva el acceso
 *   anterior, gratuito y con el mismo plan completo.
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
      accessTrialEndsAt: professionals.accessTrialEndsAt,
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
  if (ids !== "all" && ids.length === 0) return { moved: 0 };
  const staff = getAdminEmails();
  const timestamp = nowIso();
  const trialEnd = existingProfessionalTrialEnd(Date.parse(timestamp));
  const moved = await db
    .update(professionals)
    .set({
      accessPlan: "subscription",
      accessPlanChangedAt: timestamp,
      accessTrialEndsAt: sql`COALESCE(${professionals.accessTrialEndsAt}, ${trialEnd})`,
    })
    .where(
      and(
        clinicalApproved,
        eq(professionals.accessPlan, "legacy"),
        staff.length
          ? notInArray(sql`lower(${professionals.email})`, staff)
          : undefined,
        ids === "all" ? undefined : inArray(professionals.id, ids),
      ),
    )
    .returning({ id: professionals.id });
  return { moved: moved.length };
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
      trialEndsAt: professionals.accessTrialEndsAt,
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
    trialEndsAt: pro.trialEndsAt,
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

const TRIAL_REMINDER_MS = 7 * 86_400_000;

/**
 * Aviso único 7 días antes del fin de la prueba a quien aún no activó su plan.
 * Se reserva el envío en la base antes de mandar el correo (nunca dos avisos),
 * y solo corre con los cobros del software activos.
 */
export async function runTrialReminderJobs(now = Date.now()) {
  if (!membershipBillingReady()) return { reminded: 0, failed: 0 };
  const nowStamp = new Date(now).toISOString();
  const horizon = new Date(now + TRIAL_REMINDER_MS).toISOString();
  const claimed = await db
    .update(professionals)
    .set({ accessTrialRemindedAt: nowStamp })
    .where(
      and(
        clinicalApproved,
        eq(professionals.accessPlan, "subscription"),
        sql`${professionals.accessTrialRemindedAt} IS NULL`,
        sql`${professionals.accessTrialEndsAt} > ${nowStamp}`,
        sql`${professionals.accessTrialEndsAt} <= ${horizon}`,
        sql`NOT EXISTS (SELECT 1 FROM professional_memberships m WHERE m.professional_id = ${professionals.id} AND m.stripe_subscription_id IS NOT NULL AND m.status IN (${sql.join(
          MEMBERSHIP_ACCESS_STATUSES.map((status) => sql`${status}`),
          sql`, `,
        )}))`,
      ),
    )
    .returning({
      id: professionals.id,
      email: professionals.email,
      name: professionals.displayName,
      fullName: professionals.fullName,
      country: professionals.country,
      trialEndsAt: professionals.accessTrialEndsAt,
    });
  let reminded = 0;
  let failed = 0;
  for (const pro of claimed) {
    const result = await sendPlanEmail("trial-reminder", {
      email: pro.email,
      name: pro.name || pro.fullName,
      currency: suggestedMembershipCurrency(pro.country),
      trialEndsAt: pro.trialEndsAt,
    }).catch(() => ({ ok: false }));
    if (result.ok) {
      reminded++;
      continue;
    }
    failed++;
    // Sin envío confirmado, se libera la reserva para reintentar mañana.
    await db
      .update(professionals)
      .set({ accessTrialRemindedAt: null })
      .where(
        and(
          eq(professionals.id, pro.id),
          eq(professionals.accessTrialRemindedAt, nowStamp),
        ),
      );
  }
  return { reminded, failed };
}
