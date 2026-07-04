"use client";

import { useEffect } from "react";

// Analítica de clics del lado cliente (sin cookies, sin PII). Dos cosas:
//
// 1) Al cargar, guarda los UTM de la URL de aterrizaje en sessionStorage
//    (first-touch: no se sobreescriben durante la sesión). Así sabemos de qué
//    campaña vino la persona aunque luego navegue a otras páginas.
//
// 2) Con un único listener delegado, cuando alguien pulsa un CTA (un `<a>`/botón
//    con pinta de botón) o un enlace SALIENTE (wa.me, tel:, mailto:, web
//    externa), manda un beacon a /api/track con qué pulsó + los UTM de entrada.
//    No trackea la navegación interna normal (eso lo cuenta Cloudflare Web
//    Analytics como páginas vistas); aquí solo interesan las ACCIONES.

const UTM_KEY = "nido:utm";

type StoredUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

// Captura los utm_* de la URL actual una sola vez por sesión (first-touch).
function captureLandingUtm() {
  try {
    if (sessionStorage.getItem(UTM_KEY)) return;
    const p = new URLSearchParams(location.search);
    const utm: StoredUtm = {
      source: p.get("utm_source") ?? undefined,
      medium: p.get("utm_medium") ?? undefined,
      campaign: p.get("utm_campaign") ?? undefined,
      content: p.get("utm_content") ?? undefined,
    };
    // Solo persistimos si vino al menos un UTM (para no marcar la sesión como
    // "sin campaña" cuando la persona entró directa y luego llega otra visita).
    if (utm.source || utm.medium || utm.campaign) {
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    }
  } catch {}
}

function readUtm(): StoredUtm {
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    return raw ? (JSON.parse(raw) as StoredUtm) : {};
  } catch {
    return {};
  }
}

// Clasifica el elemento pulsado. Devuelve el evento a registrar, o null si es un
// clic que no nos interesa (navegación interna normal, clic en vacío, etc.).
function classify(
  el: Element,
): { type: string; label: string; href: string | null } | null {
  const trackable = el.closest<HTMLElement>(
    "a, button, [role='button'], [data-track]",
  );
  if (!trackable) return null;

  const label = (
    trackable.getAttribute("data-track-label") ||
    trackable.textContent ||
    trackable.getAttribute("aria-label") ||
    ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  const anchor =
    trackable instanceof HTMLAnchorElement ? trackable : trackable.closest("a");
  const href = anchor?.getAttribute("href") ?? null;

  // Marca explícita gana siempre: data-track="loquesea".
  const explicit = trackable.getAttribute("data-track");
  if (explicit) return { type: explicit.slice(0, 40), label, href };

  // Enlaces salientes: wa.me/tel/mailto/web externa. Son las conversiones reales.
  if (href) {
    if (/^(tel:|mailto:)/i.test(href)) return { type: "outbound", label, href };
    if (/^https?:\/\//i.test(href)) {
      try {
        if (new URL(href).host !== location.host) {
          return { type: "outbound", label, href };
        }
      } catch {}
    }
  }

  // CTAs internos: los enlaces con pinta de botón (clase "button" del sitio).
  if (
    anchor &&
    /\bbutton\b/.test(anchor.className) &&
    href &&
    href.startsWith("/")
  ) {
    return { type: "cta", label, href };
  }

  return null;
}

function send(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    // sendBeacon sobrevive a la navegación (clave para enlaces salientes que
    // cambian de página inmediatamente). Fallback a fetch keepalive.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch {}
}

// Registra una CONVERSIÓN (envío de formulario, alta) con el UTM de entrada.
// La llaman componentes cliente en las páginas de éxito, para atribuir la
// conversión real a la campaña — no basta con el clic en el botón (se dispara
// aunque el formulario sea inválido).
export function trackConversion(type: string, label?: string) {
  send({
    type,
    label: label ?? null,
    href: null,
    page: location.pathname,
    utm: readUtm(),
  });
}

export function ClickTracker() {
  useEffect(() => {
    captureLandingUtm();

    function onPointerDown(event: Event) {
      const target = event.target as Element | null;
      if (!target) return;
      const hit = classify(target);
      if (!hit) return;
      const utm = readUtm();
      send({
        type: hit.type,
        label: hit.label,
        href: hit.href,
        page: location.pathname,
        utm,
      });
    }

    // pointerdown: dispara antes de que la navegación se lleve la página.
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, []);

  return null;
}
