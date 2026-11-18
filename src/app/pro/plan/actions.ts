"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { professionalMemberships } from "@/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import { requirePracticeBillingProfessional } from "@/lib/practice/access";
import {
  MembershipCheckoutError,
  membershipCheckout,
} from "@/lib/practice/billing";
import {
  isMembershipCurrency,
  isMembershipInterval,
  MEMBERSHIP_POLICY_VERSION,
} from "@/lib/practice/membership-plan";
import { SITE_URL } from "@/lib/site";

export async function subscribeSoftware(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  // Sin el guard del CRM: un perfil en pausa por falta de plan debe poder pagar.
  const pro = await requirePracticeBillingProfessional();
  if (form.get("pricePolicy") !== MEMBERSHIP_POLICY_VERSION)
    return {
      ok: false,
      message:
        "Los precios se actualizaron. Recarga la página y confirma las condiciones actuales.",
    };
  const plan = form.get("plan");
  const currency = form.get("currency");
  if (!isMembershipInterval(plan) || !isMembershipCurrency(currency))
    return {
      ok: false,
      message:
        "Elige un plan mensual o anual y una moneda disponible antes de continuar.",
    };
  if (form.get("accept") !== "on")
    return {
      ok: false,
      message: "Confirma el precio y la renovación antes de continuar.",
    };
  let url: string;
  try {
    url = await membershipCheckout(pro, plan, currency);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof MembershipCheckoutError
          ? error.message
          : "No pudimos preparar tu pago. Comprueba tu plan y reintenta en un momento.",
    };
  }
  redirect(url);
}
export async function billingPortal(
  _prev: PracticeFormState,
  _form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeBillingProfessional();
  const stripe = getStripe();
  const member = await db.query.professionalMemberships.findFirst({
    where: eq(professionalMemberships.professionalId, pro.id),
  });
  if (!stripe || !member?.stripeCustomerId)
    return {
      ok: false,
      message:
        "No hay una suscripción disponible para gestionar. Si aparece un cargo, contacta a soporte.",
    };
  let url: string;
  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: member.stripeCustomerId,
      return_url: `${SITE_URL}/pro/plan`,
    });
    url = portal.url;
  } catch {
    return {
      ok: false,
      message:
        "No pudimos abrir el portal de facturación. Vuelve a intentar en un momento.",
    };
  }
  redirect(url);
}
