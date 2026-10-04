export const reviewWindows = [
  "agenda",
  "pacientes",
  "mensajes",
  "servicios",
  "cobros",
  "ajustes",
  "soporte",
  "plan",
  "perfil",
] as const;
export type ReviewWindow = (typeof reviewWindows)[number];

export function reviewWindow(value: unknown): ReviewWindow {
  return reviewWindows.includes(value as ReviewWindow)
    ? (value as ReviewWindow)
    : "agenda";
}

/** Destinos cerrados de la revisión administrativa; nunca acepta URLs recibidas. */
export function reviewHref(window: ReviewWindow) {
  return `/admin/crm?ventana=${window}`;
}

export function reviewProfessionalHref(href: string) {
  const window: Record<string, ReviewWindow> = {
    "/pro/consulta": "agenda",
    "/pro/pacientes": "pacientes",
    "/pro/mensajes": "mensajes",
    "/pro/servicios": "servicios",
    "/pro/cobros": "cobros",
    "/pro/ajustes": "ajustes",
    "/pro/soporte": "soporte",
    "/pro/plan": "plan",
    "/pro/dashboard": "perfil",
  };
  return reviewHref(window[href] || "agenda");
}
