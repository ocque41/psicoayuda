"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  reviewHref,
  reviewProfessionalHref,
  reviewWindow,
} from "@/lib/practice/review-navigation";
import { WorkspaceIcon, type WorkspaceIconName } from "./icon";

export type WorkspaceRole = "patient" | "professional";
type NavItem = {
  href: string;
  label: string;
  icon: WorkspaceIconName;
  match?: string;
};
const patientLinks: NavItem[] = [
  { href: "/mi", label: "Mi espacio", icon: "home" },
  { href: "/mi/calendario", label: "Calendario", icon: "calendar" },
  { href: "/mi/mensajes", label: "Mensajes", icon: "message" },
  { href: "/mi/pagos", label: "Pagos", icon: "payment" },
  { href: "/mi/ajustes", label: "Ajustes", icon: "settings" },
];
const professionalLinks: NavItem[] = [
  {
    href: "/pro/consulta",
    label: "Agenda",
    icon: "calendar",
  },
  { href: "/pro/pacientes", label: "Pacientes", icon: "profile" },
  { href: "/pro/mensajes", label: "Mensajes", icon: "message" },
  { href: "/pro/servicios", label: "Servicios", icon: "leaf" },
  { href: "/pro/cobros", label: "Cobros", icon: "payment" },
  { href: "/pro/ajustes", label: "Ajustes", icon: "settings" },
  { href: "/pro/soporte", label: "Soporte", icon: "help" },
  { href: "/pro/plan", label: "Mi plan", icon: "payment" },
  { href: "/pro/dashboard", label: "Mi perfil", icon: "profile" },
];

export function WorkspaceNav({
  audience,
  className = "",
  adminReview = false,
}: {
  audience: WorkspaceRole;
  className?: string;
  adminReview?: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const items = audience === "patient" ? patientLinks : professionalLinks;
  return (
    <aside className={`workspace-rail ${className}`}>
      <div className="workspace-rail-inner">
        <p className="workspace-rail-label">
          <span className="workspace-rail-mark" aria-hidden="true">
            <WorkspaceIcon name="leaf" />
          </span>
          {audience === "patient" ? "Tu espacio" : "Tu consulta"}
        </p>
        <nav
          id={audience === "professional" ? "practice-navigation" : undefined}
          data-workspace-navigation
          className="workspace-nav"
          aria-label={
            audience === "patient" ? "Tu espacio personal" : "Tu consulta"
          }
        >
          {items.map((item) => {
            const href = adminReview
              ? reviewProfessionalHref(item.href)
              : item.href;
            const active = adminReview
              ? href === reviewHref(reviewWindow(params.get("ventana")))
              : !item.href.includes("#") &&
                (pathname === item.href ||
                  (item.href !== "/mi" &&
                    pathname.startsWith(`${item.href}/`)) ||
                  Boolean(item.match && pathname.startsWith(item.match)));
            return (
              <Link
                key={item.href}
                href={href}
                prefetch={adminReview ? false : undefined}
                aria-current={active ? "page" : undefined}
                className="workspace-nav-link"
              >
                <WorkspaceIcon name={item.icon} />
                <span>{item.label}</span>
                {active ? (
                  <span className="workspace-nav-dot" aria-hidden="true" />
                ) : null}
              </Link>
            );
          })}
        </nav>
        <div className="workspace-rail-note">
          <span aria-hidden="true">✦</span>
          <p>Un lugar para organizar el próximo paso, a tu ritmo.</p>
          {adminReview ? (
            <Link href="/admin/consola" prefetch={false}>
              Estado de las integraciones ↗
            </Link>
          ) : (
            <Link href="/empezar?cambiar=1">Cambiar de espacio ↗</Link>
          )}
        </div>
      </div>
    </aside>
  );
}
