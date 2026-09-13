"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getServerSession } from "@/lib/auth-server";
import {
  hasCredentialPassword,
  isCredentialChangeRateLimited,
  logCredentialAudit,
  translateChangeEmailError,
  translateChangePasswordError,
} from "@/lib/credentials";
import { sendEmail } from "@/lib/email";
import {
  buildEmailChangeNoticeEmail,
  buildPasswordChangedEmail,
  buildPhoneChangedEmail,
} from "@/lib/email-templates";
import { nowIso } from "@/lib/ids";
import { SITE_URL } from "@/lib/site";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  emailChangeSchema,
  passwordChangeSchema,
  phoneUpdateSchema,
} from "@/lib/validation";

export type CredentialFormState = {
  status: "success" | "error";
  message: string;
} | null;

const RATE_LIMITED_MESSAGE =
  "Hiciste varios cambios de credenciales hace poco. Por seguridad, espera unos minutos e inténtalo otra vez.";

function formEntries(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

async function clientIp() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("cf-connecting-ip") ??
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

/**
 * Turnstile + tope por cuenta (D1). Devuelve un mensaje de error o null si el
 * intento puede continuar. Se ejecuta en TODAS las acciones de credenciales.
 */
async function securityGate(
  actorEmail: string,
  formData: FormData,
): Promise<string | null> {
  const turnstile = await verifyTurnstileToken(
    formData.get("cf-turnstile-response"),
    await clientIp(),
  );
  if (!turnstile.ok) {
    return "No pudimos confirmar que eres una persona. Recarga la página e inténtalo de nuevo.";
  }
  if (await isCredentialChangeRateLimited(actorEmail)) {
    return RATE_LIMITED_MESSAGE;
  }
  return null;
}

function dashboardUrl() {
  return `${SITE_URL.replace(/\/+$/, "")}/pro/dashboard`;
}

/**
 * Cambia el correo de la cuenta con doble confirmación (Better Auth):
 * aprobación desde el correo actual verificado y verificación de la dirección
 * nueva. Con cuentas sin verificar, el enlace va directo al correo nuevo y
 * aquí exigimos la contraseña actual si la cuenta tiene una.
 */
export async function changeMyEmail(
  _previous: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const session = await getServerSession();
  if (!session?.user?.id || !session.user.email) redirect("/pro");

  const parsed = emailChangeSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Revisa el correo que escribiste e inténtalo de nuevo.",
    };
  }

  const newEmail = parsed.data.newEmail;
  if (newEmail === session.user.email.toLowerCase()) {
    return {
      status: "error",
      message: "Ese ya es el correo de tu cuenta. Escribe uno distinto.",
    };
  }

  const gate = await securityGate(session.user.email, formData);
  if (gate) return { status: "error", message: gate };

  // Cuentas con contraseña propia: se pide como re-autenticación antes del
  // cambio (una sesión robada, sin la clave, no basta para llevarse la cuenta).
  // Las cuentas de Google no la tienen: van con sesión + doble confirmación.
  const needsPassword = await hasCredentialPassword(session.user.id);
  if (needsPassword) {
    const currentPassword = parsed.data.currentPassword ?? "";
    if (!currentPassword) {
      return {
        status: "error",
        message: "Escribe tu contraseña actual para confirmar el cambio.",
      };
    }
    try {
      await auth.api.verifyPassword({
        body: { password: currentPassword },
        headers: await headers(),
      });
    } catch (error) {
      return {
        status: "error",
        message: translateChangePasswordError(error),
      };
    }
  }

  try {
    await auth.api.changeEmail({
      body: {
        newEmail,
        callbackURL: "/pro/dashboard",
      },
      headers: await headers(),
    });
  } catch (error) {
    console.error("change email failed", {
      userId: session.user.id,
      error,
    });
    return { status: "error", message: translateChangeEmailError(error) };
  }

  await logCredentialAudit({
    actorEmail: session.user.email,
    action: "credential_email_request",
    entityId: session.user.id,
    metadata: { newEmail },
  });

  // Cuenta sin verificar: Better Auth manda el enlace de confirmación a la
  // dirección NUEVA y el correo actual no recibiría nada. Mandamos un aviso de
  // seguridad sin enlaces de acción para que la dueña sepa lo que pasa.
  if (!session.user.emailVerified) {
    const aviso = buildEmailChangeNoticeEmail({
      newEmail,
      name: session.user.name,
      dashboardUrl: dashboardUrl(),
    });
    await sendEmail({
      to: session.user.email,
      subject: aviso.subject,
      html: aviso.html,
      text: aviso.text,
    });
  }

  return {
    status: "success",
    message: session.user.emailVerified
      ? `Te enviamos un correo a tu dirección actual para que apruebes el cambio a ${newEmail}. Después confirmaremos esa dirección; hasta entonces, tu correo en Nido no cambia.`
      : `Si esa dirección se puede usar, te enviamos un enlace de confirmación a ${newEmail}. El cambio se aplica cuando lo confirmes; también avisamos a tu correo actual.`,
  };
}

/** Cambia la contraseña (exige la actual) y cierra las demás sesiones. */
export async function changeMyPassword(
  _previous: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const session = await getServerSession();
  if (!session?.user?.id || !session.user.email) redirect("/pro");

  const parsed = passwordChangeSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Revisa las contraseñas e inténtalo de nuevo.",
    };
  }

  const gate = await securityGate(session.user.email, formData);
  if (gate) return { status: "error", message: gate };

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        // false a propósito: `true` crea una sesión nueva y rota la cookie, y
        // al llamarlo desde una server action la cookie nueva no siempre llega
        // al navegador (la persona quedaba fuera tras cambiar su clave).
        revokeOtherSessions: false,
      },
      headers: await headers(),
    });
  } catch (error) {
    console.error("change password failed", {
      userId: session.user.id,
      error,
    });
    return { status: "error", message: translateChangePasswordError(error) };
  }

  // Cierra cualquier otra sesión abierta manteniendo viva la actual: si alguien
  // más estaba dentro, deja de estarlo en cuanto cambia la contraseña.
  try {
    await auth.api.revokeOtherSessions({ headers: await headers() });
  } catch (error) {
    console.error("revoke other sessions after password change failed", {
      userId: session.user.id,
      error,
    });
  }

  await logCredentialAudit({
    actorEmail: session.user.email,
    action: "credential_password_change",
    entityId: session.user.id,
  });

  const confirmacion = buildPasswordChangedEmail({
    dashboardUrl: dashboardUrl(),
    name: session.user.name,
  });
  await sendEmail({
    to: session.user.email,
    subject: confirmacion.subject,
    html: confirmacion.html,
    text: confirmacion.text,
  });

  return {
    status: "success",
    message:
      "Listo: tu contraseña cambió y cerramos las demás sesiones abiertas. Te enviamos un aviso por correo.",
  };
}

/**
 * Actualiza los teléfonos públicos del perfil (WhatsApp y fijo). No son
 * credenciales de acceso, pero son la vía de contacto pública: se avisa por
 * correo y queda rastro de auditoría. Nunca se puede quedar sin NINGUNA vía.
 */
export async function updateMyPhones(
  _previous: CredentialFormState,
  formData: FormData,
): Promise<CredentialFormState> {
  const session = await getServerSession();
  if (!session?.user?.id || !session.user.email) redirect("/pro");

  const parsed = phoneUpdateSchema.safeParse(formEntries(formData));
  if (!parsed.success) {
    return {
      status: "error",
      message:
        parsed.error.issues[0]?.message ??
        "Revisa los teléfonos e inténtalo de nuevo.",
    };
  }

  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
    columns: {
      id: true,
      emailPublic: true,
      phone: true,
      landline: true,
    },
  });
  if (!professional) {
    return {
      status: "error",
      message: "Completa tu perfil profesional antes de cambiar tus teléfonos.",
    };
  }

  const nextPhone = parsed.data.phone ?? null;
  const nextLandline = parsed.data.landline ?? null;
  if (!professional.emailPublic && !nextPhone && !nextLandline) {
    return {
      status: "error",
      message:
        "Necesitamos al menos una forma de contacto: tu correo, un WhatsApp o un teléfono fijo.",
    };
  }

  const unchanged =
    (professional.phone ?? null) === nextPhone &&
    (professional.landline ?? null) === nextLandline;
  if (unchanged) {
    return {
      status: "success",
      message: "Tus teléfonos ya estaban guardados así.",
    };
  }

  const gate = await securityGate(session.user.email, formData);
  if (gate) return { status: "error", message: gate };

  await db
    .update(professionals)
    .set({
      phone: nextPhone,
      landline: nextLandline,
      updatedAt: nowIso(),
    })
    .where(eq(professionals.id, professional.id));

  await logCredentialAudit({
    actorEmail: session.user.email,
    action: "credential_phone_change",
    entityId: professional.id,
    metadata: { phone: Boolean(nextPhone), landline: Boolean(nextLandline) },
  });

  const aviso = buildPhoneChangedEmail({
    dashboardUrl: dashboardUrl(),
    phone: nextPhone,
    landline: nextLandline,
    name: session.user.name,
  });
  await sendEmail({
    to: session.user.email,
    subject: aviso.subject,
    html: aviso.html,
    text: aviso.text,
  });

  revalidatePath("/pro/dashboard");
  revalidatePath("/profesionales");
  revalidatePath("/");

  return {
    status: "success",
    message:
      "Guardamos tus teléfonos. Te enviamos un aviso por correo; si no fuiste tú, escríbenos cuanto antes.",
  };
}
