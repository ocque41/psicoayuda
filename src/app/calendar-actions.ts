"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { getServerSession } from "@/lib/auth-server";
import { calendarAudience, currentCalendarActor } from "@/lib/calendar/access";
import { beginCalendarOAuth, calendarSettingsPath } from "@/lib/calendar/oauth";
import { saveCalendarPreferences } from "@/lib/calendar/preferences";
import { disconnectGoogleCalendar } from "@/lib/calendar/purge";
import { syncGoogleCalendar } from "@/lib/calendar/sync";

const fail = (message: string): PracticeFormState => ({ ok: false, message });
export async function connectCalendar(
  _previous: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const audience = calendarAudience(form.get("espacio"));
  if (!audience || form.get("consent") !== "on")
    return fail(
      "Confirma que quieres copiar los horarios de Nido a Google Calendar.",
    );
  const actor = await currentCalendarActor(audience);
  if (!actor)
    return fail(
      "Verifica tu correo y entra en tu espacio para conectar el calendario.",
    );
  let url: string;
  try {
    url = await beginCalendarOAuth(actor);
  } catch {
    return fail(
      "No pudimos iniciar la conexión. Si ya hay un calendario conectado, desconéctalo antes de conectar otra cuenta.",
    );
  }
  redirect(url);
}
export async function synchronizeCalendar(
  _previous: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const audience = calendarAudience(form.get("espacio"));
  const actor = audience ? await currentCalendarActor(audience) : null;
  if (!actor)
    return fail("Verifica tu correo y entra en tu espacio para sincronizar.");
  try {
    const result = await syncGoogleCalendar(actor);
    revalidatePath(calendarSettingsPath(actor.audience));
    return {
      ok: true,
      message: result.complete
        ? "Tu calendario de Google está actualizado."
        : "Este paso se completó. Pulsa Continuar sincronización para terminar de copiar y revisar tu agenda.",
    };
  } catch {
    revalidatePath(calendarSettingsPath(actor.audience));
    return fail(
      "No se completó la sincronización. Tus sesiones en Nido se conservan. Reintenta o vuelve a conectar si Google retiró el permiso.",
    );
  }
}
export async function disconnectCalendar(
  _previous: PracticeFormState,
  _form: FormData,
): Promise<PracticeFormState> {
  const session = await getServerSession();
  if (!session?.user.id)
    return fail("Entra en tu cuenta para desconectar el calendario.");
  try {
    await disconnectGoogleCalendar(session.user.id);
    revalidatePath("/pro/ajustes");
    revalidatePath("/mi/ajustes");
    return {
      ok: true,
      message:
        "Google Calendar está desconectado de tu cuenta Nido. Los eventos que ya copiaste siguen en Google; puedes borrar su calendario Nido allí.",
    };
  } catch {
    revalidatePath("/pro/ajustes");
    revalidatePath("/mi/ajustes");
    return fail(
      "No pudimos confirmar la retirada del permiso. Espera a que termine cualquier sincronización y reintenta. La conexión conserva su estado para completar la desconexión.",
    );
  }
}
export async function saveGoogleReminders(
  _previous: PracticeFormState,
  form: FormData,
): Promise<PracticeFormState> {
  const audience = calendarAudience(form.get("espacio")),
    session = await getServerSession();
  if (!audience || !session?.user.id)
    return fail("Entra en tu espacio para guardar esta preferencia.");
  const rawRevision = form.get("revision"),
    revision =
      typeof rawRevision === "string" && /^\d{1,10}$/.test(rawRevision)
        ? Number(rawRevision)
        : -1;
  const changed = await saveCalendarPreferences(
    session.user.id,
    audience,
    revision,
    {
      googleReminders: form.get("googleReminders") === "on",
      autoSync: form.get("autoSync") === "on",
    },
  );
  revalidatePath("/pro/ajustes");
  revalidatePath("/mi/ajustes");
  if (!changed)
    return fail(
      "Las preferencias cambiaron o la sincronización está en curso. Revisa el estado actualizado y vuelve a guardar.",
    );
  return {
    ok: true,
    message:
      "Preferencias guardadas. Sincroniza ahora para aplicarlas o espera la actualización periódica si la activaste.",
  };
}
