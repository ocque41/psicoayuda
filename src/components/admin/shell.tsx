import Link from "next/link";
import type { ReactNode } from "react";
import { AdminLegacyNavigation } from "./legacy-navigation";
import { type AdminNavigationItem, adminNavigation } from "./navigation";
import styles from "./shell.module.css";

export function AdminShell({
  active,
  children,
  badges = {},
  title,
  description,
  items = adminNavigation,
  accountEmail,
  legacyNavigation = false,
}: {
  active: string;
  children: ReactNode;
  badges?: Record<string, number>;
  title?: string;
  description?: string;
  items?: readonly AdminNavigationItem[];
  accountEmail?: string;
  legacyNavigation?: boolean;
}) {
  const current = items.find((item) => item.id === active);
  const navigation = (
    <nav aria-label="Secciones de administración">
      <ul className={styles.links}>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              className={styles.link}
              href={item.href}
              aria-current={item.id === active ? "page" : undefined}
              prefetch={false}
            >
              <span>{item.label}</span>
              {(badges[item.id] || 0) > 0 ? (
                <span
                  className={styles.badge}
                  role="img"
                  aria-label={`${badges[item.id]} pendientes`}
                >
                  {badges[item.id] > 99 ? "99+" : badges[item.id]}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
  return (
    <div className={`admin ${styles.shell}`}>
      {legacyNavigation ? <AdminLegacyNavigation /> : null}
      <a className={styles.skip} href="#admin-content">
        Ir al contenido
      </a>
      <aside className={styles.sidebar} aria-label="Navegación del equipo">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            N
          </span>
          <div>
            <strong>Nido</strong>
            <span className={styles.brandDescription}>Administración</span>
          </div>
        </div>
        <div className={styles.desktopNavigation}>{navigation}</div>
        <details className={styles.mobileNavigation}>
          <summary>
            <span>{current?.label || title || "Administración"}</span>
            <span>Cambiar sección</span>
          </summary>
          {navigation}
        </details>
        {items === adminNavigation ? (
          <div className={styles.sidebarFooter}>
            <Link href="/admin/export" prefetch={false}>
              Descargar solicitudes CSV <span aria-hidden="true">↗</span>
            </Link>
            <span>Espacio privado del equipo</span>
          </div>
        ) : null}
      </aside>
      <div className={styles.main} id="admin-content" tabIndex={-1}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Equipo Nido</p>
            <h1 id={active}>{title || current?.label || "Administración"}</h1>
            <p className={styles.description}>
              {description || current?.description}
            </p>
          </div>
          {accountEmail ? (
            <details className={styles.account}>
              <summary>Mi acceso</summary>
              <p>{accountEmail}</p>
              <p>Cuenta administradora</p>
            </details>
          ) : null}
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
