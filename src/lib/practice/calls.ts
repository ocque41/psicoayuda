import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  callConsents,
  conversations,
  practiceAppointments,
  practiceCallRooms,
  practiceCredentials,
  practicePatients,
  professionals,
  seekerSessions,
} from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { hasPatientConversationAccess } from "@/lib/patient/access";
import { SEEKER_COOKIE, verifySeekerToken } from "@/lib/seeker-token";
export const CALL_POLICY_VERSION = "calls-2026-10-02";
export function callsConfigured() {
  return Boolean(process.env.DAILY_API_KEY);
}
export function captureConfigured() {
  return (
    callsConfigured() &&
    process.env.NIDO_PRACTICE_ENABLED === "true" &&
    process.env.NIDO_CALL_CAPTURE_ENABLED === "true" &&
    Boolean(process.env.NIDO_CALL_CAPTURE_POLICY_URL)
  );
}
export async function dailyRequest<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  if (!process.env.DAILY_API_KEY)
    throw new Error("Las llamadas integradas aún no están configuradas.");
  const response = await fetch(`https://api.daily.co/v1${path}`, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (method === "DELETE" && response.status === 404) return undefined as T;
  if (!response.ok)
    throw new Error("El proveedor de llamadas no pudo completar la operación.");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function patientActor(
  patientId: string,
  options: { financialAccess?: boolean } = {},
) {
  const patient = await db.query.practicePatients.findFirst({
    where: and(eq(practicePatients.id, patientId)),
  });
  if (!patient) return null;
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.id, patient.professionalId),
    columns: { id: true, userId: true, status: true, nonClinicalHelper: true },
  });
  if (
    !pro ||
    pro.nonClinicalHelper ||
    (!options.financialAccess && pro.status !== "approved")
  )
    return null;
  const session = await getServerSession();
  if (session?.user.id === pro.userId)
    return { patient, role: "professional" as const };
  if (!patient.conversationId) return null;
  if (
    session?.user.id &&
    (await hasPatientConversationAccess(
      session.user.id,
      patient.conversationId,
    ))
  ) {
    const chat = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, patient.conversationId),
        eq(conversations.professionalId, pro.id),
        isNull(conversations.deletedAt),
        isNull(conversations.anonymizedAt),
      ),
      columns: { status: true },
    });
    if (chat && (options.financialAccess || chat.status === "open"))
      return { patient, role: "seeker" as const };
  }
  const raw = (await cookies()).get(SEEKER_COOKIE)?.value;
  const token = raw
    ? verifySeekerToken(raw, getAuthSecret(), Date.now())
    : null;
  if (!token || token.conversationId !== patient.conversationId) return null;
  const [seek, chat] = await Promise.all([
    db.query.seekerSessions.findFirst({
      where: and(
        eq(seekerSessions.sid, token.sid),
        eq(seekerSessions.conversationId, patient.conversationId),
      ),
    }),
    db.query.conversations.findFirst({
      where: and(
        eq(conversations.id, patient.conversationId),
        eq(conversations.professionalId, pro.id),
        isNull(conversations.deletedAt),
        isNull(conversations.anonymizedAt),
      ),
    }),
  ]);
  if (
    seek?.role !== "seeker" ||
    seek.revokedAt ||
    seek.expiresAt.getTime() <= Date.now() ||
    !chat ||
    (!options.financialAccess && chat.status !== "open")
  )
    return null;
  return { patient, role: "seeker" as const };
}
export async function appointmentActor(id: string) {
  const appointment = await db.query.practiceAppointments.findFirst({
    where: eq(practiceAppointments.id, id),
  });
  if (!appointment) return null;
  const actor = await patientActor(appointment.patientId);
  if (!actor || actor.patient.professionalId !== appointment.professionalId)
    return null;
  return { ...actor, appointment };
}
export async function joinCall(
  actor: NonNullable<Awaited<ReturnType<typeof appointmentActor>>>,
) {
  const { appointment, role } = actor;
  const scope = await db.query.practiceCredentials.findFirst({
    where: and(
      eq(practiceCredentials.professionalId, appointment.professionalId),
      eq(practiceCredentials.patientCountry, actor.patient.country),
      gt(practiceCredentials.expiresAt, new Date().toISOString()),
    ),
    columns: { id: true },
  });
  if (!scope)
    throw new Error(
      "El equipo debe confirmar el ámbito de atención para este país antes de abrir la llamada.",
    );
  const now = Date.now();
  const end = Date.parse(appointment.endsAt) + 60 * 60000;
  if (
    appointment.status !== "scheduled" ||
    appointment.modality !== "online" ||
    now < Date.parse(appointment.startsAt) - 15 * 60000 ||
    now >= end
  )
    throw new Error(
      "La llamada abre 15 minutos antes de la sesión y cierra una hora después del final previsto.",
    );
  const consents = await db
    .select()
    .from(callConsents)
    .where(eq(callConsents.appointmentId, appointment.id));
  const recording =
    captureConfigured() &&
    ["professional", "seeker"].every((r) =>
      consents.some(
        (c) =>
          c.role === r &&
          c.policyVersion === CALL_POLICY_VERSION &&
          c.recording,
      ),
    );
  const transcription =
    captureConfigured() &&
    ["professional", "seeker"].every((r) =>
      consents.some(
        (c) =>
          c.role === r &&
          c.policyVersion === CALL_POLICY_VERSION &&
          c.transcription,
      ),
    );
  // Nombre opaco y nuevo al cambiar consentimiento: tokens previos no reviven.
  const version = createHash("sha256")
    .update(
      `${appointment.startsAt}|${appointment.endsAt}|${appointment.updatedAt}|` +
        (consents
          .map(
            (c) =>
              `${c.role}:${c.recording}:${c.transcription}:${c.policyVersion}:${c.updatedAt}`,
          )
          .sort()
          .join("|") || "no-capture"),
    )
    .digest("hex")
    .slice(0, 12);
  const roomName = `nido-${appointment.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 30)}-${version}`;
  let room: { name: string; url: string; privacy: string };
  try {
    room = await dailyRequest(`/rooms/${roomName}`);
  } catch {
    try {
      room = await dailyRequest("/rooms", {
        name: roomName,
        privacy: "private",
        properties: {
          exp: Math.floor(end / 1000),
          nbf: Math.floor(
            (Date.parse(appointment.startsAt) - 15 * 60000) / 1000,
          ),
          max_participants: 2,
          eject_at_room_exp: true,
          enable_chat: false,
          enable_recording: recording ? "cloud" : null,
          enable_recording_ui: recording,
          enable_transcription_storage: transcription,
          lang: "es",
          geo: "eu",
        },
      });
    } catch {
      room = await dailyRequest(`/rooms/${roomName}`);
    }
  }
  if (
    room.privacy !== "private" ||
    !room.url?.startsWith("https://") ||
    new URL(room.url).hostname.split(".").slice(-2).join(".") !== "daily.co"
  )
    throw new Error("La sala no cumple las condiciones de acceso.");
  // Una retirada de consentimiento puede haber ocurrido mientras hablábamos con Daily.
  const latest = await db
    .select()
    .from(callConsents)
    .where(eq(callConsents.appointmentId, appointment.id));
  const latestVersion = createHash("sha256")
    .update(
      `${appointment.startsAt}|${appointment.endsAt}|${appointment.updatedAt}|` +
        (latest
          .map(
            (c) =>
              `${c.role}:${c.recording}:${c.transcription}:${c.policyVersion}:${c.updatedAt}`,
          )
          .sort()
          .join("|") || "no-capture"),
    )
    .digest("hex")
    .slice(0, 12);
  const freshActor = await appointmentActor(appointment.id);
  const freshScope = await db.query.practiceCredentials.findFirst({
    where: and(
      eq(practiceCredentials.professionalId, appointment.professionalId),
      eq(practiceCredentials.patientCountry, actor.patient.country),
      gt(practiceCredentials.expiresAt, new Date().toISOString()),
    ),
    columns: { id: true },
  });
  if (
    latestVersion !== version ||
    !freshScope ||
    !freshActor ||
    freshActor.role !== role ||
    freshActor.appointment.status !== "scheduled" ||
    freshActor.appointment.updatedAt !== appointment.updatedAt ||
    freshActor.appointment.startsAt !== appointment.startsAt ||
    freshActor.appointment.endsAt !== appointment.endsAt
  ) {
    await dailyRequest(`/rooms/${roomName}`, undefined, "DELETE");
    throw new Error("Cambió el consentimiento. Vuelve a entrar a la llamada.");
  }
  await db
    .insert(practiceCallRooms)
    .values({
      name: roomName,
      appointmentId: appointment.id,
      professionalId: appointment.professionalId,
      expiresAt: new Date(end + 30 * 86400000).toISOString(),
    })
    .onConflictDoNothing();
  await db
    .update(practiceAppointments)
    .set({ dailyRoom: roomName })
    .where(eq(practiceAppointments.id, appointment.id));
  const token = await dailyRequest<{ token: string }>("/meeting-tokens", {
    properties: {
      room_name: roomName,
      user_name: role === "professional" ? "Profesional" : "Paciente",
      user_id: `${role}-${appointment.id}`,
      is_owner: false,
      exp: Math.floor(end / 1000),
      eject_at_token_exp: true,
      enable_recording_ui: false,
      enable_live_captions_ui: transcription,
      ...(recording && role === "professional"
        ? { enable_recording: "cloud", start_cloud_recording: true }
        : {}),
      auto_start_transcription: transcription && role === "professional",
      lang: "es",
      permissions: { canAdmin: false },
    },
  });
  return `${room.url}?t=${encodeURIComponent(token.token)}`;
}
