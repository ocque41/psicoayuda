"use client";

import { useEffect } from "react";
import { announceAccountSessionChange } from "@/lib/chat-session-end";

/** El servidor comprueba la sesión antes de montar este retorno de OAuth. */
export function AccountSessionReturn({ destination }: { destination: string }) {
  useEffect(() => {
    announceAccountSessionChange();
    window.location.replace(destination);
  }, [destination]);

  return (
    <section className="section">
      <div className="container">
        <h1>Preparando tu espacio</h1>
        <p role="status">Tu acceso está confirmado. Un momento…</p>
        <noscript>
          <p>
            Activa JavaScript para actualizar tu sesión en las otras ventanas.
          </p>
          <a className="button human" href={destination}>
            Continuar a mi espacio
          </a>
        </noscript>
      </div>
    </section>
  );
}
