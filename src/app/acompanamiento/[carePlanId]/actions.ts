"use server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { carePlans } from "@/db/schema";
import { getStripe } from "@/lib/payments/stripe";
import { patientActor } from "@/lib/practice/calls";
import { careCheckout } from "@/lib/practice/care";
import { SITE_URL } from "@/lib/site";
export async function acceptCareCheckout(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const plan = await db.query.carePlans.findFirst({
    where: eq(carePlans.id, String(form.get("carePlanId") || "")),
  });
  const actor = plan ? await patientActor(plan.patientId) : null;
  if (!plan || !actor || actor.role !== "seeker" || form.get("accept") !== "on")
    return {
      ok: false,
      message:
        "Entra desde tu chat y acepta las condiciones del acuerdo para continuar.",
    };
  let url: string;
  try {
    url = await careCheckout(plan.id);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "No pudimos abrir el pago.",
    };
  }
  redirect(url);
}
export async function carePortal(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const plan = await db.query.carePlans.findFirst({
    where: eq(carePlans.id, String(form.get("carePlanId") || "")),
  });
  const actor = plan
    ? await patientActor(plan.patientId, { financialAccess: true })
    : null;
  const stripe = getStripe();
  if (actor?.role !== "seeker" || !plan?.stripeCustomerId || !stripe)
    return {
      ok: false,
      message:
        "Entra desde tu chat para gestionar esta suscripción. Si no tienes acceso, contacta a soporte.",
    };
  const portal = await stripe.billingPortal.sessions.create({
    customer: plan.stripeCustomerId,
    return_url: `${SITE_URL}/acompanamiento/${plan.id}`,
  });
  redirect(portal.url);
}
