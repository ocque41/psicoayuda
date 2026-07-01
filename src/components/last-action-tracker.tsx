"use client";

import { useEffect } from "react";

const KEY = "nido:lastAction";

export type LastAction = { label?: string; href?: string; page?: string };

/**
 * Recuerda el último botón/enlace que el usuario tocó (texto + destino + página)
 * para que, si el siguiente render revienta, el aviso a los admins pueda decir
 * "qué acción llevó al error". Se monta una vez en el layout raíz.
 */
export function LastActionTracker() {
  useEffect(() => {
    function onPointerDown(event: Event) {
      const target = event.target as Element | null;
      const el = target?.closest("a, button, [role='button']");
      if (!el) return;
      const label = (el.textContent || el.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
      const href =
        el instanceof HTMLAnchorElement ? el.getAttribute("href") : null;
      const action: LastAction = {
        label,
        href: href ?? undefined,
        page: location.pathname,
      };
      try {
        sessionStorage.setItem(KEY, JSON.stringify(action));
      } catch {}
    }
    // Capturing pointerdown: corre antes de que un handler pueda lanzar y romper.
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, []);
  return null;
}

export function readLastAction(): LastAction | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastAction) : null;
  } catch {
    return null;
  }
}
