/** El historial distingue años y muestra la zona; no depende de la hora del servidor. */
export function supportDateFormatter(timeZone = "UTC") {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("es", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("es", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  }
  return (value: string) => {
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? formatter.format(date)
      : "Fecha no disponible";
  };
}
