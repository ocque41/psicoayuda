"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/site-nav";
import styles from "./app-frame.module.css";

type FrameArea = "public" | "professional" | "patient" | "shared" | "demo";

/** La entrada profesional y la recuperación de contraseña siguen siendo públicas. */
export function frameArea(pathname: string): FrameArea {
  if (pathname === "/demo/consulta" || pathname.startsWith("/demo/consulta/"))
    return "demo";
  if (pathname === "/mi" || pathname.startsWith("/mi/")) return "patient";
  if (pathname.startsWith("/pro/") && pathname !== "/pro/restablecer")
    return "professional";
  if (
    ["/c/", "/sesion/", "/acompanamiento/"].some((prefix) =>
      pathname.startsWith(prefix),
    )
  )
    return "shared";
  return "public";
}

/** Los slots públicos siguen siendo componentes de servidor; no contienen datos privados. */
export function AppFrame({
  children,
  publicHeader,
  publicFooter,
  publicStructuredData,
}: {
  children: ReactNode;
  publicHeader: ReactNode;
  publicFooter: ReactNode;
  publicStructuredData: ReactNode;
}) {
  const area = frameArea(usePathname());
  const isWorkspace =
    area === "professional" || area === "patient" || area === "shared";
  const workspaceHref =
    area === "professional"
      ? "/pro/consulta"
      : area === "patient"
        ? "/mi"
        : "/empezar";
  const workspaceLabel = area === "professional" ? "Tu consulta" : "Tu espacio";

  return (
    <>
      <a
        className="skip-link"
        href="#contenido"
        onClick={(event) => {
          event.preventDefault();
          const content = document.getElementById("contenido");
          content?.focus({ preventScroll: true });
          content?.scrollIntoView({ block: "start", behavior: "instant" });
        }}
      >
        Saltar al contenido
      </a>
      {area === "public" ? publicHeader : null}
      {isWorkspace ? (
        <header className={styles.header} data-workspace-header>
          <div className={styles.bar}>
            <Link
              className={styles.brand}
              href={workspaceHref}
              aria-label={`Nido · ${workspaceLabel}`}
            >
              <Image
                src="/brand/nido-icon-128.png"
                width={36}
                height={36}
                alt=""
              />
              <span>Nido</span>
              <span className={styles.separator} aria-hidden="true" />
              <span className={styles.area}>{workspaceLabel}</span>
            </Link>
            <nav className={styles.account} aria-label="Tu cuenta">
              <SiteNav variant="workspace" />
            </nav>
          </div>
        </header>
      ) : null}
      <main
        id="contenido"
        tabIndex={-1}
        className={area === "public" ? undefined : styles.main}
      >
        {children}
      </main>
      {area === "public" ? publicFooter : null}
      {area === "public" ? publicStructuredData : null}
    </>
  );
}
