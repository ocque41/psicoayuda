"use client";

import { useId, useRef } from "react";
import type { Organization } from "@/lib/organizations";

type ContactLink = NonNullable<Organization["contactLinks"]>[number];

/**
 * Icono de WhatsApp en SVG inline (sin assets externos: la CSP es estricta).
 * `aria-hidden` porque es decorativo; el texto del enlace ya nombra el canal.
 */
function WhatsAppIcon() {
  return (
    <svg
      className="org-contact-icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 1.98c2.12 0 4.11.83 5.61 2.33a7.86 7.86 0 0 1 2.32 5.6c0 4.37-3.55 7.92-7.93 7.92a7.9 7.9 0 0 1-4.03-1.1l-.29-.17-2.99.78.8-2.92-.19-.3a7.86 7.86 0 0 1-1.2-4.2c0-4.37 3.56-7.92 7.9-7.92Zm4.53 10.03c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.42-.14-.01-.31-.01-.47-.01-.16 0-.43.06-.65.31-.23.24-.86.84-.86 2.05 0 1.21.88 2.38 1 2.54.12.16 1.73 2.64 4.19 3.7.58.26 1.04.41 1.4.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28Z"
      />
    </svg>
  );
}

/**
 * Pop-up ("ver todo con un clic") para organizaciones con VARIAS vías de contacto
 * (p. ej. una fundación con una línea de WhatsApp por psicóloga). La ficha del
 * directorio muestra solo la vía principal para no alargarse; este diálogo abre
 * TODOS los nombres y números —y la descripción completa— sin recortar nada.
 *
 * Usa el `<dialog>` nativo con `showModal()`: trae de serie cerrar con Escape,
 * atrapar el foco y el backdrop, sin dependencias extra. Todos los contactos se
 * renderizan de forma UNIFORME (misma fila tappable con icono de WhatsApp),
 * ignorando `tone` a efectos visuales: todas son la misma acción (abrir WhatsApp).
 */
export function OrgContactsDialog({
  orgName,
  description,
  links,
}: {
  orgName: string;
  description?: string;
  links: readonly ContactLink[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        className="button secondary block"
        style={{ marginTop: "6px" }}
        onClick={() => ref.current?.showModal()}
      >
        Ver todos los datos de contacto ({links.length})
      </button>

      {/* Cerrar al pulsar el backdrop (el clic cae sobre el propio <dialog>, no
          sobre su contenido). El cierre por teclado ya lo aporta el <dialog>
          nativo con Escape, por eso no hace falta onKeyDown. */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape lo maneja el <dialog> nativo */}
      <dialog
        ref={ref}
        className="org-dialog"
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === ref.current) close();
        }}
      >
        <div className="org-dialog-body">
          <div className="org-dialog-head">
            <h3 id={titleId} className="org-dialog-title">
              {orgName}
            </h3>
            <button
              type="button"
              className="org-dialog-close"
              onClick={close}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          {description ? (
            <p className="org-dialog-desc">{description}</p>
          ) : null}

          <p className="org-dialog-label">Datos de contacto</p>
          <ul className="org-contact-list">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  className="org-contact-row"
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="org-contact-badge" aria-hidden="true">
                    <WhatsAppIcon />
                  </span>
                  <span className="org-contact-text">{link.text}</span>
                  <span className="org-contact-chevron" aria-hidden="true">
                    ›
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
