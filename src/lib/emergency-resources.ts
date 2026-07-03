/**
 * Directorio de recursos EXTERNOS de respuesta al terremoto (búsqueda de
 * personas, daños estructurales, acopio, refugios, salud, etc.). Enlaces a webs
 * de terceros que la comunidad ha levantado; Nido solo los agrupa para dar
 * alcance. Lista curada en código a propósito (patrón `resources.ts`/`partners.ts`).
 *
 * IMPORTANTE: son webs externas — no las controla Nido. Si una deja de funcionar,
 * marca `note` (p. ej. "parece no estar operativa") o quítala. La categoría con
 * `priority: true` se destaca arriba del todo (barra roja) además de listarse.
 */

export type EmergencyLink = {
  /** URL absoluta (con https://). */
  readonly url: string;
  /** Texto visible: el dominio (y ruta) tal cual. */
  readonly label: string;
  /** Aviso opcional, p. ej. estado de la web. */
  readonly note?: string;
};

export type EmergencyCategory = {
  readonly id: string;
  readonly title: string;
  readonly links: readonly EmergencyLink[];
  /** Destacar arriba del todo (barra roja titilante). */
  readonly priority?: boolean;
};

// Atajo para no repetir "https://": el label es el dominio, la url lo antepone.
function link(label: string, note?: string): EmergencyLink {
  return { url: `https://${label}`, label, ...(note ? { note } : {}) };
}

export const EMERGENCY_RESOURCES: readonly EmergencyCategory[] = [
  {
    id: "busqueda-ninos",
    title: "Todas las actualizaciones",
    priority: true,
    links: [link("terremotovenezuela.com")],
  },
  {
    id: "personas-desaparecidas",
    title: "Reporte de personas desaparecidas",
    links: [
      link("desaparecidosterremotovenezuela.com"),
      link("facebook.com/crisisresponse"),
      link("terremotovenezuela.app"),
      link("terremotovenezuela.com"),
      link("venezuela.tiltely.com"),
      link("venezuelareporta.org"),
      link("venezuelatebusca.com"),
    ],
  },
  {
    id: "red-apoyo",
    title: "Red de apoyo",
    links: [link("redayudavenezuela.com"), link("sosvenezuela2026.com")],
  },
  {
    id: "danos-estructurales",
    title:
      "Evaluación de daños estructurales e ingenieros para inspección de habitabilidad",
    links: [
      link("appcentinela.com"),
      link("habitable.lovable.app"),
      link("revisatuedificio.com"),
      link("sismovenezuela.org"),
      link("tilinapp.com/inspeccion-emergencia"),
    ],
  },
  {
    id: "rescate",
    title: "Apoyo presencial y rescate",
    links: [link("rescate-ve.vercel.app")],
  },
  {
    id: "centros-acopio",
    title: "Centros de acopio",
    links: [
      link("ajevenezuela.org/ayuda-venezuela"),
      link("ayudaparavenezuela.com"),
      link("veneconnect.com/apoyo-terremoto"),
      link("zonasegura.up.railway.app"),
    ],
  },
  {
    id: "insumos",
    title: "Insumos requeridos por zona",
    links: [link("ayudaparavenezuela.com")],
  },
  {
    id: "alimentacion",
    title: "Centros de alimentación",
    links: [link("refugiosvenezuela.com", "parece no estar operativa")],
  },
  {
    id: "refugios",
    title: "Refugios y alojamiento",
    links: [
      link("refugiosvenezuela.com", "parece no estar operativa"),
      link("zonasegura.up.railway.app"),
    ],
  },
  {
    id: "ayuda-psicologica",
    title: "Ayuda psicológica",
    links: [link("ornate-griffin-293b66.netlify.app")],
  },
  {
    id: "hospitales",
    title: "Pacientes en hospitales",
    links: [
      link("hospitalesenvenezuela.com"),
      link("pacientesterremotovzla.lovable.app"),
    ],
  },
  {
    id: "medico-emergencias",
    title: "Apoyo médico y emergencias",
    links: [link("nueveonce.com"), link("venemergencia.com")],
  },
  {
    id: "mascotas",
    title: "Información de mascotas",
    links: [link("huellascan.com/terremoto")],
  },
  {
    id: "logistica",
    title: "Logística y transporte",
    links: [link("rescate-ve.vercel.app")],
  },
];

// Categoría destacada (barra roja arriba del todo). `undefined` si no hay ninguna.
export const priorityCategory: EmergencyCategory | undefined =
  EMERGENCY_RESOURCES.find((category) => category.priority);
