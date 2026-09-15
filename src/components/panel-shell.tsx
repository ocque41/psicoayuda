"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { SideDrawer } from "@/components/side-drawer";
import {
  isPanelItemActive,
  isPanelSectionHref,
  type PanelNavGroup,
  panelSectionId,
  panelSectionIds,
} from "@/lib/panel-nav";

/**
 * Iconos del menú (trazo de 1.7 px, 24×24, estilo Feather). Son decorativos:
 * el texto del enlace siempre va al lado, así que no cargan significado.
 */
const ICONS: Record<string, ReactNode> = {
  home: (
    <>
      <path d="M3 9.5 12 2l9 7.5" />
      <path d="M5 8.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 10h18" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-5l-2 3h-6l-2-3H2" />
      <path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z" />
    </>
  ),
  chat: (
    <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M15.5 4.2a3.5 3.5 0 0 1 0 6.6" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4.5" width="20" height="15" rx="2" />
      <path d="m2.5 6.5 9.5 7 9.5-7" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  user: (
    <>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7.5" r="3.5" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.5 20.5-4.2-4.2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.9-2.8 2.9" />
      <path d="M12 17h.01" />
    </>
  ),
  chart: (
    <>
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7v5.2l3.4 2" />
    </>
  ),
  userPlus: (
    <>
      <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7.5" r="3.5" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M2.5 12h19" />
      <path d="M12 2.5a15.3 15.3 0 0 1 4 9.5 15.3 15.3 0 0 1-4 9.5 15.3 15.3 0 0 1-4-9.5 15.3 15.3 0 0 1 4-9.5z" />
    </>
  ),
  star: (
    <path d="m12 2.8 2.95 5.98 6.6.96-4.78 4.65 1.13 6.58L12 17.86l-5.9 3.1 1.13-6.58L2.45 9.74l6.6-.96z" />
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5M12 15V3" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 21.5s7.5-3.7 7.5-9.5V5.5L12 2.8 4.5 5.5v6.5c0 5.8 7.5 9.5 7.5 9.5z" />
      <path d="m9 11.8 2.1 2.1L15.2 10" />
    </>
  ),
  menu: (
    <>
      <path d="M3.5 7h17M3.5 12h17M3.5 17h17" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19.5V4.5M5.5 11 12 4.5 18.5 11" />
    </>
  ),
};

/** Icono del catálogo por nombre (si no existe, no pinta nada). */
export function PanelIcon({ name }: { name?: string }) {
  const paths = name ? ICONS[name] : undefined;
  if (!paths) return null;
  return (
    <svg
      className="panel-nav-icon"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

function scrollPanelToTop() {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
}

/**
 * Armazón de los paneles con navegación: en escritorio, columna fija a la
 * izquierda; en móvil, cajón deslizante (SideDrawer). Los enlaces de sección se
 * resaltan según lo que está a la vista (IntersectionObserver).
 */
export function PanelShell({
  ariaLabel,
  menuLabel,
  title,
  groups,
  children,
}: {
  ariaLabel: string;
  /** Etiqueta del botón flotante en móvil ("Secciones"). */
  menuLabel: string;
  /** Rótulo de la cabecera del menú ("Tu panel", "Administración"…). */
  title: string;
  groups: PanelNavGroup[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [activeSection, setActiveSection] = useState("");
  // El cajón guarda la ruta en la que se abrió: al navegar, deja de coincidir y
  // se cierra solo (sin efectos extra que sincronicen estado).
  const [drawer, setDrawer] = useState<{ path: string; open: boolean }>({
    path: "",
    open: false,
  });
  const drawerOpen = drawer.open && drawer.path === pathname;
  const sectionKey = panelSectionIds(groups).join("|");

  useEffect(() => {
    const ids = sectionKey ? sectionKey.split("|") : [];
    const headings = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (headings.length === 0) {
      // Vista sin anclas: que ninguna sección quede marcada por error.
      setActiveSection("");
      return;
    }
    const tops = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            tops.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            tops.delete(entry.target.id);
          }
        }
        if (tops.size === 0) return;
        // La sección más arriba entre las visibles es la que "manda".
        const [topMost] = [...tops.entries()].sort((a, b) => a[1] - b[1]);
        setActiveSection(topMost ? topMost[0] : "");
      },
      // Descuenta la barra superior fija y exige que la sección ocupe la parte
      // alta de la pantalla para considerarla activa.
      { rootMargin: "-120px 0px -55% 0px" },
    );
    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [sectionKey]);

  const closeDrawer = useCallback(() => {
    setDrawer((current) => ({ ...current, open: false }));
  }, []);
  const openDrawer = useCallback(() => {
    setDrawer({ path: pathname, open: true });
  }, [pathname]);

  const renderNav = (onNavigate?: () => void) => (
    <nav className="panel-nav" aria-label={ariaLabel}>
      {groups.map((group) => (
        <div className="panel-nav-group" key={group.label}>
          <p className="panel-nav-heading">{group.label}</p>
          <ul className="panel-nav-list">
            {group.items.map((item) => {
              const active = isPanelItemActive({
                href: item.href,
                pathname,
                activeSection,
              });
              return (
                <li key={item.href}>
                  <Link
                    className="panel-nav-link"
                    href={item.href}
                    aria-current={
                      active
                        ? isPanelSectionHref(item.href)
                          ? "true"
                          : "page"
                        : undefined
                    }
                    onClick={() => {
                      if (isPanelSectionHref(item.href)) {
                        // Respuesta inmediata al toque, sin esperar al observer.
                        setActiveSection(panelSectionId(item.href));
                      }
                      onNavigate?.();
                    }}
                  >
                    <PanelIcon name={item.icon} />
                    <span className="panel-nav-label">{item.label}</span>
                    {item.badge ? (
                      <span className="panel-nav-badge">{item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <button
        type="button"
        className="panel-nav-top"
        onClick={scrollPanelToTop}
      >
        <PanelIcon name="arrowUp" />
        <span>Volver arriba</span>
      </button>
    </nav>
  );

  return (
    <div className="panel-shell">
      <aside className="panel-aside">
        <div className="panel-sidebar">
          <p className="panel-sidebar-title">{title}</p>
          {renderNav()}
        </div>
      </aside>

      <div className="panel-content">{children}</div>

      <SideDrawer
        open={drawerOpen}
        onOpen={openDrawer}
        onClose={closeDrawer}
        id="panel-drawer"
        title={title}
        ariaLabel={ariaLabel}
        triggerLabel={menuLabel}
        triggerIcon={<PanelIcon name="menu" />}
        triggerVariant="fab"
      >
        {renderNav(closeDrawer)}
      </SideDrawer>
    </div>
  );
}
