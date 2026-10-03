"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  { href: "/mi/ajustes", label: "Preferencias", icon: "settings" },
];
const professionalLinks: NavItem[] = [
  {
    href: "/pro/consulta",
    label: "Agenda y pacientes",
    icon: "calendar",
    match: "/pro/pacientes/",
  },
  { href: "/pro/servicios", label: "Servicios", icon: "leaf" },
  { href: "/pro/dashboard#chats", label: "Mensajes", icon: "message" },
  { href: "/pro/ajustes", label: "Horario", icon: "settings" },
  { href: "/pro/soporte", label: "Soporte", icon: "help" },
  { href: "/pro/plan", label: "Mi plan", icon: "payment" },
  { href: "/pro/dashboard", label: "Mi perfil", icon: "profile" },
];

export function WorkspaceNav({
  audience,
  className = "",
}: {
  audience: WorkspaceRole;
  className?: string;
}) {
  const pathname = usePathname();
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
          className="workspace-nav"
          aria-label={
            audience === "patient" ? "Tu espacio personal" : "Tu consulta"
          }
        >
          {items.map((item) => {
            const active =
              !item.href.includes("#") &&
              (pathname === item.href ||
                Boolean(item.match && pathname.startsWith(item.match)));
            return (
              <Link
                key={item.href}
                href={item.href}
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
          <Link href="/empezar?cambiar=1">Cambiar de espacio ↗</Link>
        </div>
      </div>
    </aside>
  );
}
