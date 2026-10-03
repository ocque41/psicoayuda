"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { patientAccounts, patientConversationLinks } from "@/db/patient-schema";
import { conversations, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import {
  linkPatientConversation,
  requirePatientAccount,
} from "@/lib/patient/access";
import { patientOnboardingSchema } from "@/lib/patient/accounts";
import {
  createPatientSessionRequest,
  withdrawPatientRequest,
} from "@/lib/patient/requests";
import { SEEKER_COOKIE, verifySeekerToken } from "@/lib/seeker-token";

export async function connectExistingChats(
  _: PracticeFormState,
  _data: FormData,
): Promise<PracticeFormState> {
  const session = await getServerSession();
  if (!session?.user.id)
    return {
      ok: false,
      message: "Inicia sesión para conectar tus conversaciones.",
    };
  const accountUser = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { email: true, emailVerified: true },
  });
  let linked = 0;
  const raw = (await cookies()).get(SEEKER_COOKIE)?.value;
  const token = raw
    ? verifySeekerToken(raw, getAuthSecret(), Date.now())
    : null;
  if (
    token &&
    (await linkPatientConversation(session.user.id, token.conversationId, raw))
  )
    linked++;
  if (accountUser?.emailVerified) {
    const chats = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.seekerEmail, accountUser.email),
          isNull(conversations.anonymizedAt),
          isNull(conversations.deletedAt),
          sql`NOT EXISTS (SELECT 1 FROM ${patientConversationLinks} l WHERE l.conversation_id = ${conversations.id})`,
        ),
      )
      .limit(100);
    for (const chat of chats)
      if (await linkPatientConversation(session.user.id, chat.id)) linked++;
  }
  revalidatePath("/mi");
  revalidatePath("/mi/mensajes");
  return {
    ok: linked > 0,
    message: linked
      ? `Conectamos ${linked} conversación${linked === 1 ? "" : "es"} con tu cuenta.`
      : "No encontramos conversaciones vinculables. Si usaste otro correo, abre su enlace de acceso en este navegador y vuelve a conectar. Tu correo de cuenta debe estar verificado.",
  };
}
export async function savePatientPreferences(
  _: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const { account } = await requirePatientAccount();
  const parsed = patientOnboardingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0].message };
  await db
    .update(patientAccounts)
    .set({ ...parsed.data, updatedAt: nowIso() })
    .where(eq(patientAccounts.userId, account.userId));
  revalidatePath("/mi", "layout");
  return {
    ok: true,
    message:
      "Tus preferencias están guardadas. Las sesiones ya acordadas mantienen su horario.",
  };
}
export async function requestPatientSession(
  _: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const { account } = await requirePatientAccount();
  try {
    await createPatientSessionRequest(account.userId, {
      conversationId: String(form.get("conversationId") || ""),
      appointmentId: String(form.get("appointmentId") || "") || undefined,
      kind: String(form.get("kind") || "new") as
        | "new"
        | "reschedule"
        | "cancel",
      preferredLocal: String(form.get("preferredLocal") || "") || undefined,
      timezone: account.timezone,
      reason: String(form.get("reason") || "other") as "other",
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "No pudimos enviar la solicitud. Vuelve a intentarlo.",
    };
  }
  revalidatePath("/mi");
  revalidatePath("/mi/calendario");
  revalidatePath("/pro/consulta");
  return {
    ok: true,
    message:
      "Solicitud enviada. El profesional revisará contigo la disponibilidad y las condiciones; la cita no cambia hasta que la confirme.",
  };
}
export async function withdrawSessionRequest(
  _: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const { account } = await requirePatientAccount();
  const changed = await withdrawPatientRequest(
    account.userId,
    String(form.get("requestId") || ""),
  );
  revalidatePath("/mi");
  revalidatePath("/mi/calendario");
  revalidatePath("/pro/consulta");
  return {
    ok: changed,
    message: changed
      ? "Retiraste la solicitud. Tus sesiones confirmadas siguen igual."
      : "La solicitud ya cambió. Actualiza la página para verla.",
  };
}

export async function sendPatientVerification(
  _: PracticeFormState,
  _form: FormData,
): Promise<PracticeFormState> {
  const session = await getServerSession();
  if (!session?.user.id)
    return {
      ok: false,
      message: "Inicia sesión antes de verificar tu correo.",
    };
  const accountUser = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { id: true, email: true, emailVerified: true },
  });
  if (!accountUser)
    return { ok: false, message: "Esta cuenta ya no está disponible." };
  if (accountUser.emailVerified)
    return { ok: true, message: "Tu correo ya está verificado." };
  const timestamp = nowIso(),
    since = new Date(Date.now() - 3600000).toISOString(),
    recent = new Date(Date.now() - 60000).toISOString();
  const attempt = await db.values<[string]>(
    sql`INSERT INTO audit_logs (id,actor_email,action,entity_type,entity_id,created_at) SELECT ${newId("log")},NULL,'patient_verification_requested','user',${accountUser.id},${timestamp} WHERE (SELECT count(*) FROM audit_logs WHERE action='patient_verification_requested' AND entity_id=${accountUser.id} AND created_at >= ${since}) < 3 AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE action='patient_verification_requested' AND entity_id=${accountUser.id} AND created_at >= ${recent}) RETURNING id`,
  );
  if (!attempt.length)
    return {
      ok: false,
      message:
        "Espera un minuto antes de pedir otro enlace. Puedes solicitar hasta tres por hora.",
    };
  try {
    await auth.api.sendVerificationEmail({
      body: { email: accountUser.email, callbackURL: "/mi/ajustes" },
      headers: await headers(),
    });
  } catch {
    return {
      ok: false,
      message:
        "No pudimos enviar el enlace. Espera un minuto y vuelve a intentarlo.",
    };
  }
  return {
    ok: true,
    message:
      "Enviamos un enlace a tu correo. Ábrelo para verificarlo y después vuelve a conectar tus conversaciones.",
  };
}
