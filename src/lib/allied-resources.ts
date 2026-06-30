// Directorio de PLATAFORMAS ALIADAS para la emergencia del terremoto de
// Venezuela (24 jun 2026). Son iniciativas ciudadanas de terceros; Nido no las
// controla ni garantiza su disponibilidad. Curaduría basada en la red de
// "Plataformas Aliadas" de terremotovenezuela.com. Nido es el nodo de apoyo
// psicológico de ese ecosistema.

export type AlliedLink = {
  readonly name: string;
  readonly url: string;
  /** Nota honesta (p. ej. "puede no estar operativa") o "Estás aquí". */
  readonly note?: string;
};

export type AlliedCategory = {
  readonly title: string;
  readonly description?: string;
  readonly links: readonly AlliedLink[];
};

export const ALLIED_CURATOR = {
  name: "terremotovenezuela.com",
  url: "https://terremotovenezuela.com/",
};

export const DAMAGE_MAP = {
  name: "Mapa de daños — Venezuela",
  url: "https://terremotovenezuela.com/",
  description:
    "Reportes ciudadanos de edificios afectados, con sismos del USGS y el visor oficial de Esri Disaster Response.",
};

export const ALLIED_CATEGORIES: readonly AlliedCategory[] = [
  {
    title: "Buscar a una persona",
    description: "Familiares, personas desaparecidas, niñas y niños.",
    links: [
      {
        name: "Búsqueda de niñas y niños (prioritario)",
        url: "https://busca.nexosignal.co/",
      },
      {
        name: "Reporte de personas desaparecidas",
        url: "https://desaparecidosterremotovenezuela.com/",
      },
      { name: "Venezuela te busca", url: "https://venezuelatebusca.com/" },
      { name: "Venezuela reporta", url: "https://venezuelareporta.org/" },
    ],
  },
  {
    title: "Refugios y alojamiento",
    links: [
      { name: "Zona Segura", url: "https://zonasegura.up.railway.app/" },
      {
        name: "Refugios Venezuela",
        url: "https://refugiosvenezuela.com/",
        note: "Puede no estar operativa",
      },
    ],
  },
  {
    title: "Hospitales y apoyo médico",
    links: [
      {
        name: "Pacientes en hospitales",
        url: "https://hospitalesenvenezuela.com/",
      },
      {
        name: "Pacientes (terremoto)",
        url: "https://pacientesterremotovzla.lovable.app/",
      },
      { name: "Nueve Once (emergencias)", url: "https://nueveonce.com/" },
      { name: "Venemergencia", url: "https://venemergencia.com/" },
    ],
  },
  {
    title: "Centros de acopio e insumos",
    links: [
      {
        name: "Ayuda para Venezuela",
        url: "https://ayudaparavenezuela.com/",
      },
      {
        name: "AJE Venezuela — Ayuda",
        url: "https://ajevenezuela.org/ayuda-venezuela",
      },
      {
        name: "Veneconnect — Apoyo terremoto",
        url: "https://veneconnect.com/apoyo-terremoto",
      },
    ],
  },
  {
    title: "Rescate, logística y apoyo presencial",
    links: [{ name: "Rescate VE", url: "https://rescate-ve.vercel.app/" }],
  },
  {
    title: "Inspección de daños estructurales",
    description:
      "Para evaluar si un edificio es habitable. No entres a estructuras dañadas.",
    links: [
      { name: "Revisa tu edificio", url: "https://revisatuedificio.com/" },
      { name: "App Centinela", url: "https://appcentinela.com/" },
      { name: "Sismo Venezuela", url: "https://sismovenezuela.org/" },
    ],
  },
  {
    title: "Mascotas",
    links: [
      { name: "HuellasCan — Terremoto", url: "https://huellascan.com/terremoto" },
    ],
  },
  {
    title: "Apoyo psicológico",
    description: "Estás en Nido. Otras opciones de salud mental:",
    links: [
      { name: "Nido — apoyo psicológico", url: "/", note: "Estás aquí" },
      {
        name: "Apoyo psicológico (aliada)",
        url: "https://ornate-griffin-293b66.netlify.app/",
      },
    ],
  },
];
