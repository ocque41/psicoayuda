"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { professionals, sessionPackages } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import { createPackageCheckout } from "@/lib/payments/checkout";
import {
  getStripeSecretKey,
  isStripeSupportedCountry,
  stripeCountryCode,
} from "@/lib/payments/config";
import {
  isCheckoutRateLimited,
  logCheckoutAttempt,
} from "@/lib/payments/limits";
import { sessionPackageSchema } from "@/lib/payments/packages";
import { getStripe } from "@/lib/payments/stripe";
import { getRequesterHash } from "@/lib/requester-hash";

export type PackageFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type PayState = { status: "idle" | "error"; message?: string };

function formEntries(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)]),
  );
}

async function requireProfessional() {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/pro");
  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });
  if (!professional) redirect("/pro/onboarding");
  return professional;
}

async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "https://saludmental-venezuela.com";
}

/** Crea o actualiza un paquete de sesiones del profesional. */
export async function saveSessionPackage(
  _previous: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const professional = await requireProfessional();
  if (professional.status !== "approved") {
    return {
      status: "error",
      message:
        "Tu perfil debe estar aprobado para configurar cobros. Te avisaremos por correo.",
    };
  }

  const parsed = sessionPackageSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Revisa los datos del paquete e inténtalo de nuevo.",
    };
  }

  const timestamp = nowIso();
  const packageId = String(formData.get("packageId") ?? "").trim();

  if (packageId) {
    const updated = await db
      .update(sessionPackages)
      .set({ ...parsed.data, updatedAt: timestamp })
      .where(
        and(
          eq(sessionPackages.id, packageId),
          eq(sessionPackages.professionalId, professional.id),
        ),
      )
      .returning({ id: sessionPackages.id });
    if (updated.length === 0) {
      return { status: "error", message: "No encontramos ese paquete." };
    }
    revalidatePath("/pro/dashboard");
    return { status: "success", message: "Paquete actualizado." };
  }

  await db.insert(sessionPackages).values({
    id: newId("pkg"),
    professionalId: professional.id,
    ...parsed.data,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  revalidatePath("/pro/dashboard");
  return {
    status: "success",
    message: "Paquete creado. Ya puedes compartir su link de pago.",
  };
}

/** Activa o desactiva un paquete (los links de un paquete inactivo no cobran). */
export async function toggleSessionPackage(formData: FormData): Promise<void> {
  const professional = await requireProfessional();
  const packageId = String(formData.get("packageId") ?? "").trim();
  const active = formData.get("active") === "on";
  if (!packageId) return;

  await db
    .update(sessionPackages)
    .set({ active, updatedAt: nowIso() })
    .where(
      and(
        eq(sessionPackages.id, packageId),
        eq(sessionPackages.professionalId, professional.id),
      ),
    );
  revalidatePath("/pro/dashboard");
}

/** Elimina un paquete. Los pagos ya hechos conservan su snapshot contable. */
export async function deleteSessionPackage(formData: FormData): Promise<void> {
  const professional = await requireProfessional();
  const packageId = String(formData.get("packageId") ?? "").trim();
  if (!packageId) return;

  await db
    .delete(sessionPackages)
    .where(
      and(
        eq(sessionPackages.id, packageId),
        eq(sessionPackages.professionalId, professional.id),
      ),
    );
  revalidatePath("/pro/dashboard");
}

/**
 * Inicia (o retoma) el alta de cobros en Stripe: crea la cuenta Connect Express
 * si no existe y redirige al onboarding hospedado por Stripe. Al volver, el
 * panel refresca el estado (?cobros=volviendo).
 */
export async function startStripeOnboarding(): Promise<void> {
  const professional = await requireProfessional();

  if (professional.status !== "approved" || !professional.offersPaidServices) {
    redirect("/pro/dashboard?cobros=perfil#cobros");
  }
  const stripe = getStripe();
  if (!stripe || !getStripeSecretKey()) {
    redirect("/pro/dashboard?cobros=sin-configurar#cobros");
  }
  if (!isStripeSupportedCountry(professional.country)) {
    redirect("/pro/dashboard?cobros=pais#cobros");
  }

  const origin = await requestOrigin();

  let accountId = professional.stripeAccountId;
  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: stripeCountryCode(professional.country) ?? undefined,
        email: professional.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { nido_professional_id: professional.id },
      });
      accountId = account.id;
      await db
        .update(professionals)
        .set({ stripeAccountId: accountId, updatedAt: nowIso() })
        .where(eq(professionals.id, professional.id));
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/pro/dashboard?cobros=reintentar#cobros`,
      return_url: `${origin}/pro/dashboard?cobros=volviendo#cobros`,
    });
    redirect(link.url);
  } catch (error) {
    console.error("startStripeOnboarding failed", {
      professionalId: professional.id,
      error,
    });
    // Si la plataforma aún no completó el alta de Connect, no es un fallo
    // transitorio ni culpa del profesional: se lo decimos con honestidad en vez
    // de mandarlo a "inténtalo de nuevo".
    const message = error instanceof Error ? error.message : "";
    if (/signed up for Connect/i.test(message)) {
      redirect("/pro/dashboard?cobros=plataforma#cobros");
    }
    redirect("/pro/dashboard?cobros=error#cobros");
  }
}

/**
 * Crea el Checkout de Stripe para un paquete y redirige a la pasarela. El
 * `conversationId` es opcional (link compartido desde un chat) y solo se usa si
 * la conversación pertenece al mismo profesional. Es un endpoint público: tiene
 * rate-limit por IP (hash) respaldado en D1 y cada intento queda contado antes
 * de llamar a Stripe.
 */
export async function payForPackage(
  _previous: PayState,
  formData: FormData,
): Promise<PayState> {
  const packageId = String(formData.get("packageId") ?? "").trim();
  const conversationId =
    String(formData.get("conversationId") ?? "").trim() || null;
  if (!packageId) {
    return { status: "error", message: "No encontramos ese paquete." };
  }

  const requesterHash = await getRequesterHash("payment_checkout");
  if (await isCheckoutRateLimited(requesterHash)) {
    return {
      status: "error",
      message:
        "Demasiados intentos de pago seguidos. Espera unos minutos y vuelve a intentarlo.",
    };
  }
  await logCheckoutAttempt(requesterHash, packageId);

  const result = await createPackageCheckout({
    packageId,
    conversationId,
    origin: await requestOrigin(),
  });
  if (!result.ok) {
    return { status: "error", message: result.message };
  }
  redirect(result.url);
}
