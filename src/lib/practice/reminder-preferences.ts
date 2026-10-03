import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { appointmentReminderPreferences } from "@/db/reminder-schema";
import { user } from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { timeZoneSchema } from "./domain";
import {
  REMINDER_OFFSETS,
  type ReminderPreferencesView,
  type ReminderRole,
} from "./reminder-options";

const preferencesSchema = z
  .object({
    emailEnabled: z.boolean(),
    offsets: z
      .array(
        z
          .number()
          .int()
          .refine(
            (value) => REMINDER_OFFSETS.some((allowed) => allowed === value),
            "Elige una anticipación de la lista.",
          ),
      )
      .min(1)
      .max(3),
    timeZone: timeZoneSchema,
    revision: z.number().int().min(0).max(1_000_000),
  })
  .refine((value) => new Set(value.offsets).size === value.offsets.length, {
    message: "Elige anticipaciones distintas para cada recordatorio.",
    path: ["offsets"],
  });

export function reminderProviderReady() {
  return Boolean(process.env.RESEND_API_KEY && process.env.CONTACT_FROM_EMAIL);
}

export function parseReminderPreferences(form: FormData) {
  const emailEnabled = form.get("emailEnabled") === "on";
  let offsets = form
    .getAll("offsetMinutes")
    .map(Number)
    .filter((value) => value !== 0);
  // Apagar el canal no exige corregir selecciones de avisos que ya no se enviarán.
  if (!emailEnabled)
    offsets = [
      ...new Set(
        offsets.filter((value) =>
          REMINDER_OFFSETS.some((allowed) => allowed === value),
        ),
      ),
    ].slice(0, 3);
  return preferencesSchema.safeParse({
    emailEnabled,
    offsets: offsets.length ? offsets : emailEnabled ? [] : [1440],
    timeZone: String(form.get("timeZone") || ""),
    revision: Number(form.get("revision")),
  });
}

export async function reminderPreferencesForUser(
  userId: string,
  role: ReminderRole,
  fallbackTimeZone: string,
): Promise<ReminderPreferencesView> {
  const [preferences, accountUser] = await Promise.all([
    db
      .select()
      .from(appointmentReminderPreferences)
      .where(
        and(
          eq(appointmentReminderPreferences.userId, userId),
          eq(appointmentReminderPreferences.role, role),
        ),
      )
      .limit(1),
    db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1),
  ]);
  const row = preferences[0];
  let offsets = [1440];
  try {
    const parsed = JSON.parse(row?.offsetsJson || "[1440]");
    if (
      Array.isArray(parsed) &&
      parsed.length >= 1 &&
      parsed.length <= 3 &&
      parsed.every((value) =>
        REMINDER_OFFSETS.some((allowed) => allowed === value),
      )
    )
      offsets = parsed;
  } catch {
    /* Preferencias antiguas inválidas se muestran sin activar envíos. */
  }
  return {
    emailEnabled: Boolean(row?.emailEnabled),
    offsets,
    timeZone: row?.timeZone || fallbackTimeZone,
    revision: row?.revision || 0,
    emailVerified: Boolean(accountUser[0]?.emailVerified),
    providerReady: reminderProviderReady(),
  };
}

/** La identidad y el rol llegan del guard del servidor. CAS evita que una
 * ventana antigua vuelva a activar avisos que se desactivaron en otra. */
export async function saveReminderPreferences(
  userId: string,
  role: ReminderRole,
  form: FormData,
) {
  const parsed = parseReminderPreferences(form);
  if (!parsed.success)
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ||
        "Revisa las preferencias de recordatorios.",
    };
  const value = parsed.data;
  const [accountUser] = await db
    .select({ emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (value.emailEnabled && !accountUser?.emailVerified)
    return {
      ok: false,
      message:
        "Verifica el correo de tu cuenta para activar los recordatorios.",
    };
  if (value.emailEnabled && !reminderProviderReady())
    return {
      ok: false,
      message:
        "Los recordatorios por correo todavía no están disponibles. Puedes conservarlos desactivados y volver más adelante.",
    };
  const offsetsJson = JSON.stringify([...value.offsets].sort((a, b) => b - a));
  const timestamp = nowIso();
  try {
    const changed = await db.values<
      [number]
    >(sql`INSERT INTO appointment_reminder_preferences(user_id,role,email_enabled,offsets_json,time_zone,revision,created_at,updated_at)
      SELECT u.id,${role},${value.emailEnabled ? 1 : 0},${offsetsJson},${value.timeZone},1,${timestamp},${timestamp}
      FROM user u WHERE u.id=${userId}
      AND (${value.emailEnabled ? 1 : 0}=0 OR u.email_verified=1)
      AND ((${role}='professional' AND EXISTS(SELECT 1 FROM professionals pro WHERE pro.user_id=u.id AND pro.status='approved' AND pro.non_clinical_helper=0))
        OR (${role}='patient' AND EXISTS(SELECT 1 FROM patient_accounts pa WHERE pa.user_id=u.id AND pa.deletion_state='active' AND pa.onboarding_completed_at IS NOT NULL)))
      AND ((${value.revision}=0 AND NOT EXISTS(SELECT 1 FROM appointment_reminder_preferences old WHERE old.user_id=u.id AND old.role=${role}))
        OR EXISTS(SELECT 1 FROM appointment_reminder_preferences old WHERE old.user_id=u.id AND old.role=${role} AND old.revision=${value.revision}))
      ON CONFLICT(user_id,role) DO UPDATE SET email_enabled=excluded.email_enabled,offsets_json=excluded.offsets_json,time_zone=excluded.time_zone,
        revision=appointment_reminder_preferences.revision+1,updated_at=excluded.updated_at
      WHERE appointment_reminder_preferences.revision=${value.revision} RETURNING revision`);
    if (!changed.length)
      return {
        ok: false,
        message:
          "Estas preferencias cambiaron en otra ventana o tu cuenta dejó de estar disponible. Actualiza la página antes de volver a guardar.",
      };
    return {
      ok: true,
      message: value.emailEnabled
        ? "Recordatorios guardados. Te avisaremos cerca de las anticipaciones que elegiste, con la hora en tu zona."
        : "Recordatorios por correo desactivados. Las sesiones acordadas siguen igual.",
    };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos guardar los recordatorios. Tus elecciones siguen en el formulario; vuelve a intentarlo.",
    };
  }
}
