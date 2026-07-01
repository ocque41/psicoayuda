// Normaliza un teléfono libre a dígitos en formato internacional (E.164 sin "+")
// para construir enlaces wa.me / tel:. El público objetivo es Venezuela, así que
// el código de país por defecto es +58.
//
// ponytail: una sola heurística con código de país por defecto. Si en el futuro
// hay profesionales fuera de Venezuela en volumen, guarda su país en la ficha y
// pásalo como `cc`; por ahora, que escriban "+<código>" si no son de VE.
const DEFAULT_CC = "58";

/**
 * Devuelve el número en internacional solo-dígitos (ej. "584121234567") listo
 * para `https://wa.me/<n>` o `tel:+<n>`, o `null` si no se puede normalizar.
 */
export function toIntlNumber(
  raw: string | null | undefined,
  cc: string = DEFAULT_CC,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  if (hadPlus) {
    // Ya venía en internacional: los dígitos son el número completo.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2); // prefijo internacional "00" -> nada
  } else if (digits.startsWith("0")) {
    digits = cc + digits.slice(1); // trunk nacional "0" -> código de país
  } else if (!digits.startsWith(cc)) {
    digits = cc + digits; // número local sin prefijo
  }

  // Sanity E.164: entre 8 y 15 dígitos. Filtra basura sin pretender validar país.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Enlace de WhatsApp (`https://wa.me/<n>`) para un teléfono libre, o `null` si no
 * se puede normalizar. Permite ir directo al chat con un clic.
 */
export function whatsappUrl(
  raw: string | null | undefined,
  cc: string = DEFAULT_CC,
): string | null {
  const intl = toIntlNumber(raw, cc);
  return intl ? `https://wa.me/${intl}` : null;
}
