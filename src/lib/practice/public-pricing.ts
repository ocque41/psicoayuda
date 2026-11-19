import {
  EXISTING_PROFESSIONAL_TRIAL_DAYS,
  MEMBERSHIP_PLAN,
  MEMBERSHIP_PRICES,
  TRIAL_DAYS,
} from "@/lib/practice/membership-plan";

/**
 * Textos de precio de la web pública (/para-psicologos, /seguridad, /terminos
 * y /recursos/psicologo-online-gratis-venezuela).
 *
 * Esas páginas son estáticas: el texto se fija en el build. `next.config.ts`
 * lee `NIDO_MEMBERSHIP_BILLING_ENABLED` de `wrangler.jsonc` y expone
 * `NIDO_PUBLIC_PRICING`. Con el cobro apagado se muestran exactamente los
 * textos de siempre; al ponerlo a "true" y volver a desplegar (el despliegue
 * siempre reconstruye), las cuatro páginas pasan a los importes reales sin
 * tocar su código.
 */
export function publicPricingLive() {
  return process.env.NIDO_PUBLIC_PRICING === "live";
}

/** "14,99" a partir de céntimos, en formato español. */
function amount(cents: number) {
  return new Intl.NumberFormat("es", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function publicPricingCopy(live = publicPricingLive()) {
  const month = amount(MEMBERSHIP_PRICES.month.usd);
  const year = amount(MEMBERSHIP_PRICES.year.usd);
  const plan = `${month} al mes o ${year} al año, en dólares, euros o libras`;
  if (!live)
    return {
      heroTerm: `Prueba de ${TRIAL_DAYS} días`,
      heroPayment: "Sin tarjeta",
      ctaText: `Empieza con ${TRIAL_DAYS} días del software sin tarjeta. Después, ${MEMBERSHIP_PLAN.priceLabel} al mes si decides suscribirte. La prueba no inicia cobros automáticamente.`,
      safetyPlan: `El software para profesionales tiene un plan de ${MEMBERSHIP_PLAN.priceLabel} al mes y una prueba de ${TRIAL_DAYS} días sin tarjeta tras la aprobación del perfil.`,
      termsTrial: `La prueba del software profesional dura ${TRIAL_DAYS} días desde su activación y no inicia cobros por sí sola. Contratar una suscripción requiere aceptar el importe y la frecuencia.`,
      guidePlan: `tiene un plan de ${MEMBERSHIP_PLAN.priceLabel} al mes y una prueba de ${TRIAL_DAYS} días sin tarjeta, que comienza tras la aprobación del perfil.`,
    };
  return {
    heroTerm: "Plan mensual o anual",
    heroPayment: `${month} al mes en $, € o £`,
    ctaText: `El software cuesta ${plan}. Lo activas cuando aprobamos tu perfil y puedes cancelar la renovación cuando quieras.`,
    safetyPlan: `El software para profesionales cuesta ${plan}, y se activa tras la aprobación del perfil.`,
    termsTrial: `La suscripción al software profesional cuesta ${plan}. Los profesionales que ya estaban en Nido antes de la suscripción tienen ${EXISTING_PROFESSIONAL_TRIAL_DAYS} días gratis, que no inician cobros por sí solos. Contratar una suscripción requiere aceptar el importe, la moneda y la frecuencia.`,
    guidePlan: `cuesta ${plan}, y se activa tras la aprobación del perfil.`,
  };
}
