"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/app/actions-error";
import { readLastAction } from "@/components/last-action-tracker";

export default function ErrorBoundary({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Deduplica por sesión: si el usuario reintenta o un bug se repite, no
    // inundamos el buzón de los admins con el mismo error en la misma ruta.
    const key = `nido:err:${error.digest ?? error.message}:${location.pathname}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}

    reportClientError({
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      path: location.pathname + location.search,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      lastAction: readLastAction(),
    }).catch(() => {});
  }, [error]);

  return (
    <section className="section">
      <div className="container">
        <h1>Algo salió mal</h1>
        <p className="lead">
          Tuvimos un problema técnico y ya avisamos al equipo. No es culpa tuya
          y sigues a un paso de recibir apoyo.
        </p>
        <p>
          <Link className="button human" href="/ayuda">
            Pedir ayuda psicológica gratis
          </Link>{" "}
          <Link className="button secondary" href="/">
            Volver al inicio
          </Link>
        </p>
        <p className="muted">
          Si es una emergencia, ve a <Link href="/emergencia">Emergencia</Link>.
        </p>
      </div>
    </section>
  );
}
