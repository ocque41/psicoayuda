export const REMINDER_OFFSETS = [
  15, 30, 60, 120, 360, 720, 1440, 2880, 10080,
] as const;
export const REMINDER_OFFSET_LABELS: Record<number, string> = {
  15: "15 minutos antes",
  30: "30 minutos antes",
  60: "1 hora antes",
  120: "2 horas antes",
  360: "6 horas antes",
  720: "12 horas antes",
  1440: "24 horas antes",
  2880: "2 días antes",
  10080: "1 semana antes",
};
export type ReminderRole = "professional" | "patient";

export type ReminderPreferencesView = {
  emailEnabled: boolean;
  offsets: number[];
  timeZone: string;
  revision: number;
  emailVerified: boolean;
  providerReady: boolean;
};
