import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { patientAccounts } from "@/db/patient-schema";
import { COUNTRY_OPTIONS } from "@/lib/geography";
import { nowIso } from "@/lib/ids";
import { timeZoneSchema } from "@/lib/practice/domain";

export type PatientAccount = typeof patientAccounts.$inferSelect;
export type PatientAccountUser = {
  id: string;
  name: string;
  email?: string;
  emailVerified?: boolean;
};
const countryNames = new Map<string, string>(
  COUNTRY_OPTIONS.map((c) => [c.code, c.name]),
);
export const patientOnboardingSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Indica cómo quieres que te llamemos.")
    .max(80),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .refine(
      (v) => COUNTRY_OPTIONS.some((c) => c.code === v),
      "Elige tu país de residencia.",
    ),
  timezone: timeZoneSchema,
  preferredLanguage: z.string().trim().min(2).max(20).default("es"),
  ageBand: z.enum(["adult", "guardian"]),
});
export async function patientAccountForUser(userId: string) {
  return db.query.patientAccounts.findFirst({
    where: eq(patientAccounts.userId, userId),
  });
}
export async function ensurePatientAccount(
  user: PatientAccountUser,
): Promise<PatientAccount> {
  const timestamp = nowIso();
  await db.run(sql`INSERT INTO patient_accounts (user_id,display_name,created_at,updated_at)
    SELECT u.id,${user.name.trim().slice(0, 80) || "Tu espacio"},${timestamp},${timestamp} FROM user u WHERE u.id=${user.id}
    ON CONFLICT DO NOTHING`);
  const account = await patientAccountForUser(user.id);
  if (!account)
    throw new Error("No pudimos preparar tu cuenta. Vuelve a intentarlo.");
  return account;
}
export async function completePatientOnboarding(
  userId: string,
  data: z.input<typeof patientOnboardingSchema>,
): Promise<PatientAccount> {
  const parsed = patientOnboardingSchema.parse(data);
  const timestamp = nowIso();
  await db.run(sql`INSERT INTO patient_accounts (user_id,display_name,country,timezone,preferred_language,age_band,onboarding_completed_at,created_at,updated_at)
    SELECT u.id,${parsed.displayName},${parsed.country},${parsed.timezone},${parsed.preferredLanguage},${parsed.ageBand},${timestamp},${timestamp},${timestamp} FROM user u WHERE u.id=${userId}
    ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,country=excluded.country,timezone=excluded.timezone,preferred_language=excluded.preferred_language,age_band=excluded.age_band,onboarding_completed_at=excluded.onboarding_completed_at,updated_at=excluded.updated_at WHERE patient_accounts.deletion_state='active'`);
  const account = await patientAccountForUser(userId);
  if (account?.deletionState !== "active")
    throw new Error(
      "No pudimos guardar tus preferencias. La cuenta puede estar completando una solicitud de baja.",
    );
  return account;
}
export function countryLabel(country: string) {
  return countryNames.get(country) || country;
}
