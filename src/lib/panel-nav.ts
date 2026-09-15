/**
 * Navegación lateral de los paneles (profesional y admin). Vive fuera del
 * componente cliente para poder probarla: el marcado de la sección activa es
 * fácil de romper y pasaría desapercibido.
 */

export type PanelNavItem = {
  /** Ancla de la propia página ("#chats") o ruta ("/admin/export"). */
  href: string;
  label: string;
  /** Icono del catálogo de PanelShell (si falta, el ítem va sin icono). */
  icon?: string;
  /** Contador opcional: chats sin leer, pendientes por revisar, etc. */
  badge?: number | null;
};

export type PanelNavGroup = {
  label: string;
  items: PanelNavItem[];
};

export function isPanelSectionHref(href: string): boolean {
  return href.startsWith("#") && href.length > 1;
}

export function panelSectionId(href: string): string {
  return href.replace(/^#/, "");
}

/** Ids de sección (anclas) del menú, en orden y sin repetidos. */
export function panelSectionIds(groups: PanelNavGroup[]): string[] {
  const ids: string[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (!isPanelSectionHref(item.href)) continue;
      const id = panelSectionId(item.href);
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

/**
 * ¿Está activo un ítem del menú? Las rutas se comparan con la ruta actual
 * (coincidencia exacta: /admin no se marca estando en /admin/export); las
 * anclas dependen de la sección visible, que resuelve el IntersectionObserver
 * del componente.
 */
export function isPanelItemActive(input: {
  href: string;
  pathname: string;
  activeSection: string;
}): boolean {
  const { href, pathname, activeSection } = input;
  if (isPanelSectionHref(href)) {
    return activeSection !== "" && activeSection === panelSectionId(href);
  }
  const [path] = href.split("#");
  if (!path) return false;
  return pathname === path || pathname === path.replace(/\/$/, "");
}
