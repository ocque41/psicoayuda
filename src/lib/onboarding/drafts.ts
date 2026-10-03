import "server-only";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { accountOnboardingDrafts } from "@/db/schema";
import { countryCodes, validTimeZone } from "./locale";

export type OnboardingRole = "patient" | "pro";
export type SafeDraft = Record<string, string | boolean | number | string[]>;
const patientFields = new Set([
  "displayName",
  "country",
  "timezone",
  "preferredLanguage",
  "ageBand",
  "step",
]);
const professionalFields = new Set([
  "fullName",
  "displayName",
  "country",
  "city",
  "timezone",
  "supportAreas",
  "maxActiveRequests",
  "remoteAvailable",
  "inPersonAvailable",
  "acceptingRequests",
  "crisisExperience",
  "offersPaidServices",
  "nonClinicalHelper",
  "emailPublic",
  "step",
]);

// Nunca guarda documentos, credenciales, cédula, teléfonos, correo ni relatos.
export function safeOnboardingDraft(
  role: OnboardingRole,
  input: unknown,
): SafeDraft {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: SafeDraft = {};
  const allowed = role === "patient" ? patientFields : professionalFields;
  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    if (key === "step") {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value < 64
      )
        result[key] = value;
    } else if (key === "timezone") {
      if (typeof value === "string" && validTimeZone(value))
        result[key] = value;
    } else if (key === "country" && role === "patient") {
      if (typeof value === "string" && countryCodes.includes(value))
        result[key] = value;
    } else if (typeof value === "boolean") result[key] = value;
    else if (typeof value === "string" && value.length <= 160)
      result[key] = value.trim();
    else if (
      Array.isArray(value) &&
      value.length <= 15 &&
      value.every((entry) => typeof entry === "string" && entry.length < 80)
    )
      result[key] = value;
  }
  return result;
}

export async function readOnboardingDraft(
  userId: string,
  role: OnboardingRole,
): Promise<SafeDraft> {
  const now = new Date().toISOString();
  const row = await db
    .select()
    .from(accountOnboardingDrafts)
    .where(
      and(
        eq(accountOnboardingDrafts.userId, userId),
        eq(accountOnboardingDrafts.role, role),
      ),
    )
    .limit(1);
  if (!row[0] || row[0].expiresAt <= now) return {};
  try {
    return safeOnboardingDraft(role, JSON.parse(row[0].answersJson));
  } catch {
    return {};
  }
}

export async function persistOnboardingDraft(
  userId: string,
  role: OnboardingRole,
  input: unknown,
) {
  const timestamp = new Date().toISOString();
  const answersJson = JSON.stringify(safeOnboardingDraft(role, input));
  const expiresAt = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString();
  await db.batch([
    db
      .delete(accountOnboardingDrafts)
      .where(
        and(
          eq(accountOnboardingDrafts.userId, userId),
          lt(accountOnboardingDrafts.expiresAt, timestamp),
        ),
      ),
    db
      .insert(accountOnboardingDrafts)
      .values({
        userId,
        role,
        answersJson,
        version: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [accountOnboardingDrafts.userId, accountOnboardingDrafts.role],
        set: { answersJson, updatedAt: timestamp, expiresAt },
      }),
  ]);
}
