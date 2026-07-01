/**
 * Organizaciones aliadas VERIFICADAS de Nido, para el directorio filtrable de
 * "pedir ayuda". Igual que `partners.ts`: lista curada en código a propósito
 * (son pocas y cambian rara vez, no hace falta BBDD). ponytail: si algún día son
 * muchas o las gestiona un tercero, mover a D1 + panel admin.
 *
 * IMPORTANTE: solo entran organizaciones que el equipo de coordinación ha
 * verificado, y NO se inventan datos. Nombre, teléfono, logo y web se toman de la
 * fuente oficial de cada organización; reconfírmalos antes de publicar. Una
 * entrada sin `name` se considera plantilla y NO se muestra en la web pública
 * (ver `publishedOrganizations`).
 */

// Servicios clínicos que una organización puede ofrecer. Claves estables (se usan
// en el filtro y en los sinónimos de búsqueda): no las cambies sin migrar los
// datos y los diccionarios de `search.ts`.
export const orgServices = [
  "medicina_general",
  "radiologia",
  "pediatria",
  "psiquiatria",
  "psicologia",
  "neuropsicologia",
  "pedagogia_infantil",
] as const;
export type OrgService = (typeof orgServices)[number];

export const orgServiceLabels: Record<OrgService, string> = {
  medicina_general: "Medicina general",
  radiologia: "Radiología",
  pediatria: "Pediatría",
  psiquiatria: "Psiquiatría",
  psicologia: "Psicología",
  neuropsicologia: "Neuropsicología",
  pedagogia_infantil: "Pedagogía en educación infantil",
};

// Enfoque / población a la que se dedica la organización (a qué condición o grupo
// atienden). Empezamos con lo que hay hoy; se amplía cuando entren más aliados.
export const orgSpecialties = ["autismo"] as const;
export type OrgSpecialty = (typeof orgSpecialties)[number];

export const orgSpecialtyLabels: Record<OrgSpecialty, string> = {
  autismo: "Autismo (TEA)",
};

export type Organization = {
  readonly id: string;
  /** Nombre oficial. Vacío = plantilla sin publicar (no se muestra). */
  readonly name: string;
  /** Lema breve (opcional). */
  readonly tagline?: string;
  /** Ruta al logo en /public (cuadrado). Opcional: si falta, se usa la inicial. */
  readonly logo?: string;
  readonly city?: string;
  readonly country?: string;
  /** WhatsApp / móvil en formato libre; se normaliza con `toIntlNumber`. */
  readonly phone?: string;
  /** Fijo (solo llamada). */
  readonly landline?: string;
  readonly email?: string;
  readonly url?: string;
  /** A qué se dedican (para el filtro de enfoque). */
  readonly specialties: readonly OrgSpecialty[];
  /** Servicios que ofrecen (para el filtro de servicios). */
  readonly services: readonly OrgService[];
  /** ¿Ofrecen asistencia virtual 24 horas? */
  readonly virtual24h: boolean;
};

export const ORGANIZATIONS: readonly Organization[] = [
  // Clínica especializada en autismo facilitada por el equipo. Los servicios y el
  // enfoque son los que nos pasaron; faltan los datos oficiales de identidad y
  // contacto. PENDIENTE: completar `name` (y `phone`/`url`/`logo` si los hay) con
  // la fuente oficial — mientras `name` esté vacío NO se publica.
  {
    id: "clinica-autismo",
    name: "", // ← completar con el nombre oficial de la organización
    tagline: "Especialistas en autismo",
    specialties: ["autismo"],
    services: [
      "medicina_general",
      "radiologia",
      "pediatria",
      "psiquiatria",
      "psicologia",
      "neuropsicologia",
      "pedagogia_infantil",
    ],
    virtual24h: true,
  },
];

// Solo las organizaciones publicables (con nombre confirmado). Evita mostrar
// plantillas a medio completar en la web pública.
export const publishedOrganizations: readonly Organization[] =
  ORGANIZATIONS.filter((org) => org.name.trim() !== "");
