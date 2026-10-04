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
    id: "profesionales",
    label: "Profesionales",
    href: "/admin/profesionales",
    description:
      "Revisa perfiles, credenciales, visibilidad y capacidad de atención.",
  },
  {
    id: "contactos",
    label: "Contactos",
    href: "/admin/contactos",
    description: "Preguntas, ideas y avisos enviados al equipo de Nido.",
  },
  {
    id: "admision",
    label: "Admisión",
    href: "/admin/admision",
    description:
      "Identidad, credenciales, entrevista y publicación de nuevos profesionales.",
  },
  {
    id: "crm",
    label: "CRM profesional",
    href: "/admin/crm",
    description:
      "Revisa las ventanas y los componentes de la consulta profesional.",
  },
  {
    id: "consola",
    label: "Consola",
    href: "/admin/consola",
    description:
      "Estado de la consulta, integraciones y configuración del servicio.",
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

/** El rol de admisión no recibe enlaces ni exportaciones de administración general. */
export const admissionNavigation: readonly AdminNavigationItem[] =
  adminNavigation.filter((item) => item.id === "admision");

export function isAdminView(value: string): value is AdminView {
  return adminViews.includes(value as AdminView);
}

export function adminSectionHref(section: string) {
  return adminNavigation.find((item) => item.id === section)?.href || "/admin";
}
