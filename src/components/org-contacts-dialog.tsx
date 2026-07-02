"use client";

import { useId, useRef } from "react";
import type { Organization } from "@/lib/organizations";

type ContactLink = NonNullable<Organization["contactLinks"]>[number];

function linkClass(tone: ContactLink["tone"]) {
  if (tone === "human") return "button human block";
  if (tone === "secondary") return "button secondary block";
  return "muted";
}

/**
 * Pop-up ("ver todo con un clic") para organizaciones con VARIAS vías de contacto
 * (p. ej. una fundación con una línea de WhatsApp por psicóloga). La ficha del
 * directorio muestra solo la vía principal para no alargarse; este diálogo abre
 * TODOS los nombres y números —y la descripción completa— sin recortar nada.
 *
 * Usa el `<dialog>` nativo con `showModal()`: trae de serie cerrar con Escape,
 * atrapar el foco y el backdrop, sin dependencias extra.
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
            <h3 id={titleId} style={{ margin: 0 }}>
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

          {description ? <p className="pro-bio">{description}</p> : null}

          <p className="org-dialog-label">Datos de contacto</p>
          <div className="pro-contact">
            {links.map((link, index) => (
              <a
                key={link.href}
                className={linkClass(link.tone)}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "block", marginTop: index === 0 ? 0 : "6px" }}
              >
                {link.text}
              </a>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
