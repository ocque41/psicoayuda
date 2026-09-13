"use client";

import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript() {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-nido-turnstile]",
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("turnstile-script")),
      );
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.nidoTurnstile = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile-script"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Widget de Cloudflare Turnstile para los formularios de credenciales.
 *
 * - El site key lo decide el SERVIDOR (var de runtime) y llega por props: no
 *   depende del build. Si el panel no recibe site key, no se pinta nada y el
 *   servidor tampoco exige token.
 * - Para regenerar el token (son de un solo uso), el formulario lo remonta con
 *   una `key` nueva después de cada intento.
 * - El input oculto `cf-turnstile-response` viaja dentro del <form> que
 *   envuelve al widget.
 */
export function TurnstileWidget({ siteKey }: { siteKey: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        containerRef.current.innerHTML = "";
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          language: "es",
          // Invisible salvo que Cloudflare necesite pedir interacción: para
          // una persona con sesión iniciada, cambiar sus datos no debería
          // sentirse como un CAPTCHA… hasta que haga falta.
          appearance: "interaction-only",
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile?.remove) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [siteKey]);

  if (failed) {
    return (
      <p className="hint" role="status">
        No pudimos cargar la verificación de Cloudflare. Recarga la página para
        proteger el formulario.
      </p>
    );
  }

  return <div ref={containerRef} className="turnstile-slot" />;
}
