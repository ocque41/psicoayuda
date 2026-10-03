import { COUNTRY_OPTIONS, TIME_ZONES } from "@/lib/geography";

export const countryCodes: string[] = COUNTRY_OPTIONS.map(
  (country) => country.code,
);

export function countryOptions() {
  return COUNTRY_OPTIONS.map((country) => ({
    code: country.code,
    label: country.name,
  }));
}

export function validTimeZone(value: string) {
  if (!value || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("es", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function timeZoneOptions(current = "America/Caracas") {
  return [...new Set(["UTC", current, ...TIME_ZONES])]
    .filter(validTimeZone)
    .sort();
}
