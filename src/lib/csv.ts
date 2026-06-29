/**
 * Utilidades CSV con defensa contra inyección de fórmulas (CWE-1236).
 *
 * Un valor que empieza por `= + - @` (o tab/CR) puede ejecutarse como fórmula
 * al abrir el CSV en Excel/Google Sheets/LibreOffice, permitiendo exfiltrar
 * datos de otras filas hacia una URL del atacante. Como las solicitudes de
 * ayuda las envía cualquiera sin cuenta (campos city/state/country libres),
 * neutralizamos prefijando un apóstrofo para forzar tratamiento como texto.
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

export function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  const neutralized = FORMULA_TRIGGER.test(text) ? `'${text}` : text;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export function toCsvRow(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}
