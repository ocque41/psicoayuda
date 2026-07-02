/**
 * UTM para enlaces SALIENTES (a WhatsApp o webs de terceros), para que la
 * analítica del destino atribuya el tráfico a Nido. Función pura, usable en
 * servidor y cliente.
 *
 * - No toca `tel:`, `mailto:` ni rutas internas/relativas (solo http/https).
 * - Concatena preservando el querystring existente (p. ej. el `?text=` de wa.me),
 *   así que wa.me/<n>?text=...&utm_source=... sigue funcionando (WhatsApp ignora
 *   los params extra).
 */

// El origen es siempre el dominio de Nido (lo que verá la web de destino).
const UTM_SOURCE = "saludmental-venezuela.com";

export type UtmOptions = {
  /** utm_medium: "whatsapp" para wa.me, "referral" para webs. */
  medium?: string;
  /** utm_campaign: contexto (profesionales, organizaciones, aliados, emergencia…). */
  campaign?: string;
  /** utm_content: detalle opcional (p. ej. el componente o la categoría). */
  content?: string;
};

export function withUtm(
  url: string,
  { medium = "referral", campaign = "web", content }: UtmOptions = {},
): string {
  // Solo enlaces web salientes: tel:, mailto: e internos se devuelven intactos.
  if (!/^https?:\/\//i.test(url)) return url;

  const params = new URLSearchParams();
  params.set("utm_source", UTM_SOURCE);
  params.set("utm_medium", medium);
  params.set("utm_campaign", campaign);
  if (content) params.set("utm_content", content);

  // Concatenación literal (no `new URL()`) para no re-codificar el `?text=` de
  // wa.me. Si ya hay querystring, se añade con `&`.
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${params.toString()}`;
}
