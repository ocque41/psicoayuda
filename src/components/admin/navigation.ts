export const adminViews = [
  "resumen",
  "solicitudes",
  "profesionales",
  "contactos",
  "metricas",
  "cuentas",
  "alianzas",
  "aliados",
] as const;

export type AdminView = (typeof adminViews)[number];
export type AdminNavigationItem = {
  id: string;
  label: string;
  href: string;
  description: string;
};

export const adminNavigation: readonly AdminNavigationItem[] = [
  {
    id: "resumen",
    label: "Resumen",
    href: "/admin",
    description: "Lo que necesita atención, en un vistazo.",
  },
  {
    id: "solicitudes",
    label: "Solicitudes",
    href: "/admin/solicitudes",
    description:
      "Ayuda Terremoto: revisar, asignar y dar seguimiento al apoyo gratuito.",
  },
  {
    id: "lista-espera",
    label: "Lista de espera",
    href: "/admin/lista-de-espera",
    description:
      "Apoyo general y Ayuda Terremoto, con seguimiento independiente.",
  },
  {
    id: "profesionales",
    label: "Profesionales",
    href: "/admin/profesionales",
    description:
      "Revisa perfiles, credenciales, visibilidad y capacidad de atención.",
  },
  {
    id: "admision",
    label: "Panel de Paola",
    href: "/admin/admision",
    description:
      "Admisión de nuevos profesionales: identidad, credenciales, entrevista y publicación.",
  },
  {
    id: "invitaciones",
    label: "Invitaciones",
    href: "/admin/invitaciones",
    description: "Invita a otros profesionales a probar la consulta de Nido.",
  },
  {
    id: "crm",
    label: "CRM profesional",
    href: "/admin/crm",
    description:
      "Explora las ventanas y los componentes de la consulta profesional.",
  },
  {
    id: "consola",
    label: "Consola",
    href: "/admin/consola",
    description:
      "Estado de la consulta, integraciones y configuración del servicio.",
  },
  {
    id: "contactos",
    label: "Contactos",
    href: "/admin/contactos",
    description: "Preguntas, ideas y avisos enviados al equipo de Nido.",
  },
  {
    id: "metricas",
    label: "Métricas",
    href: "/admin/metricas",
    description:
      "Consulta la actividad y encuentra la información que necesitas por período.",
  },
  {
    id: "cuentas",
    label: "Cuentas",
    href: "/admin/cuentas",
    description:
      "Registros que todavía no tienen un perfil profesional y gestión de cuentas.",
  },
  {
    id: "alianzas",
    label: "Alianzas",
    href: "/admin/alianzas",
    description:
      "Solicitudes de organizaciones que quieren colaborar con Nido.",
  },
  {
    id: "aliados",
    label: "Aliados",
    href: "/admin/aliados",
    description: "Organiza los aliados que aparecen en la página pública.",
  },
  {
    id: "operaciones",
    label: "Verificación y soporte",
    href: "/admin/operaciones",
    description:
      "Decisiones documentadas, ámbitos de atención y conversaciones de soporte.",
  },
  {
    id: "fpv",
    label: "Consulta FPV",
    href: "/admin/fpv",
    description:
      "Consulta el registro profesional para apoyar la revisión documental.",
  },
];

/** Admisión, invitaciones y consulta propia; sin administración general. */
export const admissionNavigation: readonly AdminNavigationItem[] = [
  {
    id: "admision",
    label: "Admisión",
    href: "/admin/admision",
    description: "Revisa nuevas candidaturas profesionales por etapas.",
  },
  {
    id: "invitaciones",
    label: "Invitar colegas",
    href: "/admin/invitaciones",
    description: "Comparte el enlace y un mensaje para probar el CRM.",
  },
  {
    id: "mi-consulta",
    label: "Mi consulta",
    href: "/pro/consulta",
    description: "Tu agenda, tus pacientes y tus conversaciones profesionales.",
  },
];

/** La vista de la interfaz conserva la cuenta administradora y no abre otro CRM. */
const paolaPreviewHrefs: Readonly<Record<string, string>> = {
  admision: "/admin/admision?vista=paola",
  invitaciones: "/admin/invitaciones?vista=paola",
  "mi-consulta": "/admin/crm",
};

export const paolaPreviewNavigation: readonly AdminNavigationItem[] =
  admissionNavigation.map((item) => ({
    ...item,
    href: paolaPreviewHrefs[item.id] ?? item.href,
  }));

export function isAdminView(value: string): value is AdminView {
  return adminViews.includes(value as AdminView);
}

export function adminSectionHref(section: string) {
  return adminNavigation.find((item) => item.id === section)?.href || "/admin";
}
