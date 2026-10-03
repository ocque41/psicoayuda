"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { reportClientError } from "@/app/actions-error";
import { readLastAction } from "@/components/last-action-tracker";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const privatePage =
    pathname === "/orientacion" ||
    pathname === "/pro" ||
    /^\/(mi|paciente|empezar|entrar|pro|admin|c|sesion|acompanamiento)(\/|$)/.test(
      pathname || "",
    );
  useEffect(() => {
    // Auto-recuperación de "chunk viejo": tras un deploy, un tab abierto con el
    // bundle anterior puede pedir al navegar (clic en un Link) un chunk que ese
    // deploy ya borró → ChunkLoadError → esta pantalla. Una recarga completa trae
    // el bundle nuevo y lo arregla sola. Guardia de tiempo para no entrar en bucle
    // si la recarga no lo resuelve (chunk realmente caído): en ese caso, se reporta.
    const isChunkError =
      error.name === "ChunkLoadError" ||
      /loading chunk|loading css chunk|dynamically imported module|module script failed/i.test(
        `${error.name} ${error.message}`,
      );
    if (isChunkError) {
      try {
        const last = Number(sessionStorage.getItem("nido:chunk-reload") ?? "0");
        if (Date.now() - last > 15000) {
          sessionStorage.setItem("nido:chunk-reload", String(Date.now()));
          location.reload();
          return;
        }
      } catch {
        location.reload();
        return;
      }
    }

    // No transmite rutas, búsquedas o errores de espacios sensibles a terceros.
    if (privatePage) return;

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
  }, [error, privatePage]);

  return (
    <section className="section">
      <div className="container">
        <h1>Algo salió mal</h1>
        <p className="lead">
          No pudimos cargar esta pantalla. Puedes reintentarlo; si acababas de
          guardar un cambio, comprueba su resultado antes de repetirlo.
        </p>
        <p>
          <button className="button human" type="button" onClick={reset}>
            Volver a cargar
          </button>{" "}
          <Link
            className="button secondary"
            href={
              pathname?.startsWith("/pro/") ? "/pro/consulta" : "/profesionales"
            }
          >
            {pathname?.startsWith("/pro/")
              ? "Volver a mi consulta"
              : "Buscar profesional"}
          </Link>
        </p>
        <p className="muted">
          Si es una emergencia, ve a <Link href="/emergencia">Emergencia</Link>.
        </p>
      </div>
    </section>
  );
}
