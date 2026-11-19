import "server-only";
import type Stripe from "stripe";
import { SITE_URL } from "@/lib/site";

/**
 * Objetos propios de Nido en la cuenta de Stripe que comparte con Bandicot.
 *
 * - Un único producto con ID fijo (no se crea uno por pago) y sin claves ni
 *   metadatos `bandicot_*`, para que Bandicot nunca lo confunda con sus planes.
 * - Checkout se muestra como "Nido" (`branding_settings`) y el extracto de la
 *   tarjeta usa el descriptor del producto.
 * - Un portal de facturación propio: sin él, el portal por defecto de la cuenta
 *   (el de Bandicot) dejaría cambiar a productos de Bandicot.
 */
export const MEMBERSHIP_PRODUCT_ID = "nido_software_profesional";
const PORTAL_MARKER = "membership-portal-v1";

export const MEMBERSHIP_CHECKOUT_BRANDING = {
  display_name: "Nido",
  button_color: "#2f7a5b",
  border_style: "rounded",
  icon: { type: "url", url: `${SITE_URL}/icon.png` },
} satisfies Stripe.Checkout.SessionCreateParams.BrandingSettings;

let productReady = false;
let portalId: string | null = null;

function missing(error: unknown) {
  return (error as { code?: string } | null)?.code === "resource_missing";
}

export async function membershipProductId(stripe: Stripe) {
  if (productReady) return MEMBERSHIP_PRODUCT_ID;
  try {
    const product = await stripe.products.retrieve(MEMBERSHIP_PRODUCT_ID);
    if (!product.active)
      await stripe.products.update(MEMBERSHIP_PRODUCT_ID, { active: true });
  } catch (error) {
    if (!missing(error)) throw error;
    await stripe.products.create(
      {
        id: MEMBERSHIP_PRODUCT_ID,
        name: "Nido · Software profesional",
        description:
          "Agenda, pacientes, notas, mensajes y servicios para tu consulta.",
        statement_descriptor: "NIDO SOFTWARE",
        url: `${SITE_URL}/para-psicologos`,
        metadata: { nido: "membership" },
      },
      { idempotencyKey: `nido-product-${MEMBERSHIP_PRODUCT_ID}` },
    );
  }
  productReady = true;
  return MEMBERSHIP_PRODUCT_ID;
}

export async function membershipPortalConfiguration(stripe: Stripe) {
  if (portalId) return portalId;
  const existing = await stripe.billingPortal.configurations.list({
    active: true,
    limit: 100,
  });
  const found = existing.data.find(
    (configuration) => configuration.metadata?.nido === PORTAL_MARKER,
  );
  if (found) {
    portalId = found.id;
    return portalId;
  }
  const created = await stripe.billingPortal.configurations.create(
    {
      business_profile: {
        headline: "Nido · tu suscripción al software profesional",
        privacy_policy_url: `${SITE_URL}/privacidad`,
        terms_of_service_url: `${SITE_URL}/terminos`,
      },
      default_return_url: `${SITE_URL}/pro/plan`,
      features: {
        customer_update: {
          enabled: true,
          allowed_updates: ["email", "name", "address", "tax_id"],
        },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          cancellation_reason: {
            enabled: true,
            options: ["too_expensive", "unused", "switched_service", "other"],
          },
        },
        subscription_update: { enabled: false },
      },
      metadata: { nido: PORTAL_MARKER },
    },
    { idempotencyKey: `nido-portal-${PORTAL_MARKER}` },
  );
  portalId = created.id;
  return portalId;
}

/** Solo para pruebas: olvida lo cacheado por proceso. */
export function resetStripeCatalogCache() {
  productReady = false;
  portalId = null;
}
