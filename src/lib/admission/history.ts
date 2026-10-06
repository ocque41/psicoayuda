/** Only bounded, known review fields become visible history. Never render raw JSON. */
export function admissionHistoryDetails(
  action: string,
  serialized: string | null,
): string[] {
  if (!serialized || serialized.length > 8_000) return [];
  let metadata: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    metadata = value as Record<string, unknown>;
  } catch {
    return [];
  }
  const details: string[] = [];
  const text = (key: string, limit = 300) =>
    typeof metadata[key] === "string"
      ? String(metadata[key]).trim().slice(0, limit)
      : "";
  const add = (label: string, field: string, limit = 300) => {
    const value = text(field, limit);
    if (value) details.push(`${label}: ${value}`.slice(0, 350));
  };
  if (action === "review_saved") {
    add("Cotejo de identidad", "identityReference");
    add("Cotejo de credenciales", "credentialsReference");
    add("Referencia de entrevista", "interviewReference");
    const date = text("interviewAt", 40);
    if (date && Number.isFinite(Date.parse(date)))
      details.push(
        `Entrevista: ${new Date(date).toISOString()} · ${text("interviewTimeZone", 80) || "UTC"}`.slice(
          0,
          350,
        ),
      );
    if (typeof metadata.interview === "boolean")
      details.push(
        metadata.interview
          ? "Entrevista marcada como realizada."
          : "Entrevista pendiente de realizar.",
      );
  }
  if (action === "scope_verified") {
    add("Referencia de ámbito", "registryReference");
    const expiry = text("expiresAt", 40);
    if (expiry && Number.isFinite(Date.parse(expiry)))
      details.push(`Vigencia registrada: ${new Date(expiry).toISOString()}`);
  }
  return details.slice(0, 6);
}
