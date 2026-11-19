import "server-only";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  formatMembershipPrice,
  suggestedMembershipCurrency,
  trialActive,
  trialDaysLeft,
} from "@/lib/practice/membership-plan";
import { membershipCurrent } from "@/lib/practice/subscription-access";

/**
 * Aviso fijo y discreto en todo el espacio profesional mientras dura la prueba
 * de 90 días de los perfiles anteriores. Sustituye al correo: no se puede
 * cerrar y desaparece al activar el plan. No aparece para el equipo ni para
 * quien sigue en el acceso anterior (gratuito).
 */
export async function TrialBar({ userId }: { userId: string }) {
  if (!membershipBillingReady()) return null;
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, userId),
    columns: {
      id: true,
      status: true,
      accessPlan: true,
      accessTrialEndsAt: true,
      country: true,
    },
  });
  if (
    pro?.status !== "approved" ||
    pro.accessPlan !== "subscription" ||
    !pro.accessTrialEndsAt ||
    !trialActive(pro.accessTrialEndsAt)
  )
    return null;
  if (await membershipCurrent(pro.id)) return null;
  const days = trialDaysLeft(pro.accessTrialEndsAt);
  const price = formatMembershipPrice(
    "month",
    suggestedMembershipCurrency(pro.country),
  );
  return (
    <aside className="trial-bar" aria-label="Prueba gratuita">
      <p>
        <strong>
          {days === 1 ? "Queda 1 día" : `Quedan ${days} días`} de prueba gratis.
        </strong>{" "}
        Después, {price}/mes.
      </p>
      <Link className="trial-bar-action" href="/pro/plan">
        Añadir método de pago
      </Link>
    </aside>
  );
}
