import { z } from "zod";
import { decodeBase64url } from "./encoding";

export type PushRole = "professional" | "patient";
export type PushKind = "chat" | "appointment" | "after_session";

/** The endpoint is a capability, never a general user-provided fetch target. */
export function permittedPushEndpoint(value: string): string | null {
  try {
    if (value.length > 2048 || value.trim() !== value) return null;
    const url = new URL(value);
    const host = url.hostname;
    const known =
      host === "fcm.googleapis.com" ||
      host === "updates.push.services.mozilla.com" ||
      /^[a-z0-9-]+\.push\.apple\.com$/.test(host);
    if (
      !known ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname.length < 2 ||
      value !== url.href
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function validKey(value: string, length: number) {
  try {
    return decodeBase64url(value, length).length === length;
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .refine((value) => Boolean(permittedPushEndpoint(value))),
    keys: z
      .object({
        p256dh: z
          .string()
          .refine(
            (value) => validKey(value, 65) && decodeBase64url(value)[0] === 4,
          ),
        auth: z.string().refine((value) => validKey(value, 16)),
      })
      .strict(),
  })
  .strict();

export type WebPushSubscription = z.infer<typeof pushSubscriptionSchema>;
export const pushPayloadSchema = z
  .object({
    v: z.literal(1),
    id: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
    kind: z.enum(["chat", "appointment", "after_session"]),
    role: z.enum(["professional", "patient"]),
  })
  .strict()
  .refine((v) => v.kind !== "after_session" || v.role === "professional");
export type PushPayload = z.infer<typeof pushPayloadSchema>;

export const pushPreferencesSchema = z
  .object({
    chatEnabled: z.boolean(),
    appointmentEnabled: z.boolean(),
    afterSessionEnabled: z.boolean().default(false),
    offsetMinutes: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(120),
      z.literal(1440),
    ]),
    timeZone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("es", { timeZone: value }).format();
          return true;
        } catch {
          return false;
        }
      }),
    quietEnabled: z.boolean(),
    quietStart: z.number().int().min(0).max(1439),
    quietEnd: z.number().int().min(0).max(1439),
  })
  .strict()
  .refine(
    (value) => !value.quietEnabled || value.quietStart !== value.quietEnd,
    {
      message: "Elige horas diferentes para el comienzo y el fin del descanso.",
    },
  );
export type PushPreferences = z.infer<typeof pushPreferencesSchema>;

export const pushStateSchema = z.object({
  available: z.boolean(),
  publicKey: z.string().nullable(),
  devices: z.array(
    z.object({
      id: z.string(),
      revision: z.number().int().positive(),
      active: z.boolean(),
      endpointHash: z.string(),
      preferences: pushPreferencesSchema,
    }),
  ),
});
export const pushRevocationStateSchema = z.object({
  devices: z.array(
    z.object({ id: z.string(), revokedAt: z.number().nullable() }),
  ),
});

export function insideQuietHours(preferences: PushPreferences, at: number) {
  if (!preferences.quietEnabled) return false;
  return quietAt(preferences, at, quietFormatter(preferences.timeZone));
}
function quietFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
function quietAt(
  preferences: PushPreferences,
  at: number,
  formatter: Intl.DateTimeFormat,
) {
  const parts = formatter.formatToParts(new Date(at));
  const local =
    Number(parts.find((part) => part.type === "hour")?.value) * 60 +
    Number(parts.find((part) => part.type === "minute")?.value);
  const { quietStart: start, quietEnd: end } = preferences;
  return start < end
    ? local >= start && local < end
    : local >= start || local < end;
}

/** Scan real UTC minutes: DST gaps/folds never invent a local timestamp. */
export function nextOutsideQuietHours(
  preferences: PushPreferences,
  at: number,
) {
  if (!preferences.quietEnabled) return at;
  const formatter = quietFormatter(preferences.timeZone);
  if (!quietAt(preferences, at, formatter)) return at;
  const nextMinute = Math.floor(at / 60_000) * 60_000 + 60_000;
  for (let minute = 0; minute < 26 * 60; minute++) {
    const candidate = nextMinute + minute * 60_000;
    if (!quietAt(preferences, candidate, formatter)) return candidate;
  }
  return null;
}
