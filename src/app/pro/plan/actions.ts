"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { professionalMemberships } from "@/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import {
  requirePracticeBillingProfessional,
  requirePracticeProfessional,
} from "@/lib/practice/access";
import {
  MembershipCheckoutError,
  membershipCheckout,
  startMembershipTrial,
} from "@/lib/practice/billing";
import { MEMBERSHIP_PLAN } from "@/lib/practice/membership-plan";
import { SITE_URL } from "@/lib/site";
export async function activateTrial(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  if (form.get("accept") !== "on")
    return { ok: false, message: "Confirma las condiciones de la prueba." };
  await startMembershipTrial(pro.id);
  revalidatePath("/pro/plan");
  return {
    ok: true,
    message:
      "Tu prueba está activa. No se ha solicitado tarjeta ni iniciado un cobro.",
  };
}
export async function subscribeSoftware(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const pro = await requirePracticeProfessional();
  if (
    form.get("plan") !== MEMBERSHIP_PLAN.interval ||
    form.get("pricePolicy") !== MEMBERSHIP_PLAN.policyVersion
  )
    return {
      ok: false,
      message:
        "El plan disponible es de 10 USD al mes. Recarga la página y confirma las condiciones actuales.",
    };
  if (form.get("accept") !== "on")
    return {
      ok: false,
      message: "Confirma el precio y la renovación antes de continuar.",
    };
  let url: string;
  try {
    url = await membershipCheckout(pro, MEMBERSHIP_PLAN.interval);
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
