"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { db } from "@/db";
import { auditLogs, callConsents, practiceAppointments } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import {
  appointmentActor,
  CALL_POLICY_VERSION,
  captureConfigured,
  dailyRequest,
  joinCall,
} from "@/lib/practice/calls";
export async function joinSession(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const actor = await appointmentActor(String(form.get("appointmentId") || ""));
  if (!actor)
    return { ok: false, message: "Entra con el acceso de esta consulta." };
  let url: string;
  try {
    url = await joinCall(actor);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "No pudimos abrir la llamada.",
    };
  }
  redirect(url);
}
export async function saveCallConsent(
  _prev: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const actor = await appointmentActor(String(form.get("appointmentId") || ""));
  if (!actor || !captureConfigured())
    return { ok: false, message: "Esta opción aún no está habilitada." };
  const recording = form.get("recording") === "on",
    transcription = form.get("transcription") === "on";
  // Una retirada detiene la sala anterior. No basta con cambiar una casilla en D1.
  if (actor.appointment.dailyRoom) {
    try {
      await dailyRequest(
        `/rooms/${actor.appointment.dailyRoom}`,
        undefined,
        "DELETE",
      );
    } catch {
      return {
        ok: false,
        message:
          "No pudimos detener la sala anterior. Sal de la llamada y contacta a soporte para retirar el permiso con seguridad.",
      };
    }
  }
  await db.batch([
    db
      .insert(callConsents)
      .values({
        id: newId("consent"),
        appointmentId: actor.appointment.id,
        role: actor.role,
        recording,
        transcription,
        policyVersion: CALL_POLICY_VERSION,
        updatedAt: nowIso(),
      })
      .onConflictDoUpdate({
        target: [callConsents.appointmentId, callConsents.role],
        set: {
          recording,
          transcription,
          policyVersion: CALL_POLICY_VERSION,
          updatedAt: nowIso(),
        },
      }),
    db
      .update(practiceAppointments)
      .set({ dailyRoom: null })
      .where(eq(practiceAppointments.id, actor.appointment.id)),
    db.insert(auditLogs).values({
      id: newId("log"),
      action: "call_consent_updated",
      entityType: "appointment",
      entityId: actor.appointment.id,
      metadata: JSON.stringify({
        role: actor.role,
        recording,
        transcription,
        version: CALL_POLICY_VERSION,
      }),
      createdAt: nowIso(),
    }),
  ]);
  revalidatePath(`/sesion/${actor.appointment.id}`);
  return {
    ok: true,
    message:
      "Preferencias guardadas. Si había una llamada abierta, entra de nuevo; se ha detenido para aplicar el cambio.",
  };
}
