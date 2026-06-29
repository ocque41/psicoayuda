/**
 * Recursos de crisis y apoyo psicológico VERIFICADOS para Venezuela.
 *
 * IMPORTANTE (seguridad): estos datos pueden salvar una vida, así que NO se
 * inventan números. Cada recurso cita su FUENTE y la FECHA de verificación.
 * Antes de cada lanzamiento o revisión, el equipo de coordinación DEBE
 * reconfirmar teléfonos, horarios y URLs contra la fuente oficial. Los
 * directorios (Psicomapa, Find a Helpline) se mantienen actualizados por
 * terceros y son el respaldo más fiable cuando un número cambie.
 *
 * Fuentes consultadas (jun 2026): UCAB PsicoData / El Ucabista, El Diario,
 * Cecodap. Ver el campo `source` de cada entrada.
 */

export const RESOURCES_LAST_VERIFIED = "junio de 2026";

export type ResourceContact = {
  /** "Teléfono", "WhatsApp", "Sitio web"… */
  readonly label: string;
  /** Valor mostrado (número o dominio). */
  readonly value: string;
  /** href opcional (tel:, https:). Si falta, se muestra como texto. */
  readonly href?: string;
};

export type SupportResource = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly contacts: readonly ResourceContact[];
  readonly hours?: string;
  /** Atención con foco en niños, niñas y adolescentes. */
  readonly forMinors?: boolean;
  /** Atribución de la fuente + fecha. */
  readonly source: string;
};

/**
 * Líneas de apoyo psicológico gratuito en Venezuela.
 * Orden: primero las líneas con atención directa por teléfono/WhatsApp.
 */
export const SUPPORT_LINES: readonly SupportResource[] = [
  {
    id: "psicolinea-ucab",
    name: "PsicoLínea UCAB",
    description:
      "Primeros auxilios psicológicos e intervención en crisis por teléfono, gratuita y confidencial, a cargo de profesionales de la Escuela de Psicología de la UCAB.",
    contacts: [
      {
        label: "Teléfono / WhatsApp",
        value: "0414 121 7882",
        href: "tel:+584141217882",
      },
      {
        label: "Teléfono / WhatsApp",
        value: "0424 172 3981",
        href: "tel:+584241723981",
      },
      {
        label: "Sitio web",
        value: "psicodatavzla.ucab.edu.ve/psicolinea",
        href: "https://psicodatavzla.ucab.edu.ve/psicolinea/",
      },
    ],
    hours: "Jueves de 8:00 a. m. a 5:00 p. m.",
    source: "UCAB PsicoData / El Ucabista (2024)",
  },
  {
    id: "cecodap",
    name: "Cecodap",
    description:
      "Apoyo psicológico con especial atención a niños, niñas, adolescentes y sus familias. Atención por teléfono y WhatsApp.",
    contacts: [
      {
        label: "Teléfono / WhatsApp",
        value: "0414 269 6823",
        href: "tel:+584142696823",
      },
      {
        label: "Teléfono / WhatsApp",
        value: "0424 284 2359",
        href: "tel:+584242842359",
      },
      {
        label: "Teléfono / WhatsApp",
        value: "0424 269 1229",
        href: "tel:+584242691229",
      },
      {
        label: "Sitio web",
        value: "cecodap.org.ve",
        href: "https://www.cecodap.org.ve",
      },
    ],
    forMinors: true,
    source: "El Diario (2024) / Cecodap",
  },
  {
    id: "colegio-psicologos-dc",
    name: "Colegio de Psicólogos del Distrito Capital",
    description:
      "Atención psicológica telefónica orientada por el colegio profesional.",
    contacts: [
      { label: "Teléfono", value: "0424 257 2688", href: "tel:+584242572688" },
    ],
    source: "El Diario (2024)",
  },
];

/** Directorios que listan, y mantienen al día, más recursos por estado. */
export const RESOURCE_DIRECTORIES: readonly SupportResource[] = [
  {
    id: "psicomapa",
    name: "Psicomapa (UCAB PsicoData)",
    description:
      "Mapa estado por estado de organizaciones y centros de salud mental que atienden de forma gratuita o de bajo costo en Venezuela.",
    contacts: [
      {
        label: "Sitio web",
        value: "psicologia.ucab.edu.ve/psicomapa",
        href: "https://psicologia.ucab.edu.ve/psicomapa/",
      },
    ],
    source: "UCAB PsicoData / El Ucabista (2025)",
  },
  {
    id: "find-a-helpline-ve",
    name: "Find a Helpline — Venezuela",
    description:
      "Directorio internacional gratuito de líneas de ayuda emocional disponibles en Venezuela, con verificación periódica.",
    contacts: [
      {
        label: "Sitio web",
        value: "findahelpline.com/ve",
        href: "https://findahelpline.com/ve",
      },
    ],
    source: "Find a Helpline (ThroughLine)",
  },
];

/** Recursos con foco específico en menores de edad. */
export const MINORS_RESOURCES: readonly SupportResource[] =
  SUPPORT_LINES.filter((r) => r.forMinors);
