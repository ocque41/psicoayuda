"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * Cajón lateral para móvil: botón que lo abre, fondo oscurecido, cierre con
 * Escape (y al tocar el fondo) y bloqueo del scroll de detrás. Comparte el
 * lenguaje visual de los paneles y se usa tanto en el menú del panel como en la
 * lista de conversaciones del chat.
 *
 * En escritorio no se ve nunca: cada sitio pone su columna fija (CSS).
 */
export function SideDrawer({
  open,
  onOpen,
  onClose,
  id,
  title,
  triggerLabel,
  triggerIcon,
  triggerBadge,
  triggerVariant = "fab",
  ariaLabel,
  children,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  /** Id del diálogo, para `aria-controls` del botón. */
  id: string;
  title: string;
  triggerLabel: string;
  triggerIcon?: ReactNode;
  /** Contador junto al botón (pendientes, sin leer…). */
  triggerBadge?: number | null;
  /** "fab": botón flotante abajo a la derecha; "bar": botón ancho en el flujo. */
  triggerVariant?: "fab" | "bar";
  ariaLabel: string;
  children: ReactNode;
}) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) {
      // Al cerrar, el foco vuelve al botón que lo abrió (teclado).
      if (wasOpen.current) {
        wasOpen.current = false;
        triggerRef.current?.focus();
      }
      return;
    }
    wasOpen.current = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // Al pasar a escritorio el cajón sobra: sin cerrarlo, el scroll de detrás
  // quedaría bloqueado (el cajón se oculta por CSS pero el body sigue con
  // overflow hidden).
  useEffect(() => {
    const media = window.matchMedia("(min-width: 960px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`side-drawer-trigger side-drawer-trigger--${triggerVariant}${
          open ? " is-hidden" : ""
        }`}
        aria-expanded={open}
        aria-controls={id}
        onClick={onOpen}
      >
        {triggerIcon}
        <span>{triggerLabel}</span>
        {triggerBadge ? (
          <span className="side-drawer-trigger-badge">{triggerBadge}</span>
        ) : null}
      </button>

      <div
        className="side-drawer-layer"
        id={id}
        data-open={open ? "true" : undefined}
        inert={!open}
      >
        <button
          type="button"
          className="side-drawer-backdrop"
          aria-label="Cerrar el menú"
          tabIndex={-1}
          onClick={onClose}
        />
        <div
          className="side-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          ref={drawerRef}
        >
          <div className="side-drawer-head">
            <p className="side-drawer-title">{title}</p>
            <button
              type="button"
              className="side-drawer-close"
              aria-label="Cerrar el menú"
              onClick={onClose}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
