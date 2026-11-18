import "server-only";
import { eq, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { professionalMemberships, professionals } from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  MEMBERSHIP_ACCESS_STATUSES,
  trialActive,
} from "@/lib/practice/membership-plan";

/**
 * Acceso al software profesional según el plan del perfil:
 *
 * - `legacy` (todos los perfiles anteriores a la suscripción): acceso completo.
 * - `subscription` (aprobados desde ahora, o perfiles que el equipo pasó desde
 *   /admin/planes): necesitan una suscripción vigente. Los perfiles anteriores
 *   que el equipo pasa a suscripción tienen 90 días de prueba con acceso
 *   completo (`access_trial_ends_at`).
 *
 * La exigencia solo se aplica con los cobros del software activos
 * (`membershipBillingReady`). Con los cobros apagados nadie pierde el acceso,
 * porque no habría forma de pagar. Bloquear nunca borra datos: el perfil, los
 * pacientes y el historial siguen intactos y vuelven al pagar.
 */
export const SUBSCRIPTION_PATH = "/pro/plan";

const accessStatusList = sql.join(
  MEMBERSHIP_ACCESS_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

/** Condición SQL "este profesional tiene acceso" para listados y asignación. */
export function professionalAccessOpenSql(
  professionalId: SQL | typeof professionals.id = professionals.id,
): SQL | undefined {
  if (!membershipBillingReady()) return undefined;
  return sql`(EXISTS (SELECT 1 FROM professionals ap WHERE ap.id = ${professionalId} AND (ap.access_plan = 'legacy' OR (ap.access_trial_ends_at IS NOT NULL AND ap.access_trial_ends_at > ${nowIso()}))) OR EXISTS (SELECT 1 FROM professional_memberships am WHERE am.professional_id = ${professionalId} AND am.status IN (${accessStatusList})))`;
}

export function accessLockedFor(
  accessPlan: string | null | undefined,
  membershipStatus: string | null | undefined,
  trialEndsAt?: string | null,
) {
  if (!membershipBillingReady()) return false;
  if (accessPlan !== "subscription") return false;
  if (trialActive(trialEndsAt)) return false;
  return !MEMBERSHIP_ACCESS_STATUSES.includes(
    membershipStatus as (typeof MEMBERSHIP_ACCESS_STATUSES)[number],
  );
}

/** true = debe activar o renovar su plan antes de usar el panel. */
export async function professionalAccessLocked(professionalId: string) {
  if (!membershipBillingReady()) return false;
  const [row] = await db
    .select({
      accessPlan: professionals.accessPlan,
      trialEndsAt: professionals.accessTrialEndsAt,
      status: professionalMemberships.status,
    })
    .from(professionals)
    .leftJoin(
      professionalMemberships,
      eq(professionalMemberships.professionalId, professionals.id),
    )
    .where(eq(professionals.id, professionalId))
    .limit(1);
  if (!row) return false;
  return accessLockedFor(row.accessPlan, row.status, row.trialEndsAt);
}

/** true si el perfil ya tiene una suscripción vigente (activa, en prueba o en reintento). */
export async function membershipCurrent(professionalId: string) {
  const row = await db.query.professionalMemberships.findFirst({
    where: eq(professionalMemberships.professionalId, professionalId),
    columns: { status: true, stripeSubscriptionId: true },
  });
  return Boolean(
    row?.stripeSubscriptionId &&
      MEMBERSHIP_ACCESS_STATUSES.includes(
        row.status as (typeof MEMBERSHIP_ACCESS_STATUSES)[number],
      ),
  );
}
