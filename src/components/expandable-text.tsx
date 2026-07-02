"use client";

import { useState } from "react";

/**
 * Párrafo de texto que se recorta si es largo y ofrece "Mostrar más / menos"
 * para no alargar la tarjeta. Recorte por nº de caracteres (determinista, sin
 * medir el DOM), cortando en el último espacio para no partir palabras. Si el
 * texto es corto, se muestra entero sin botón.
 */
export function ExpandableText({
  text,
  limit = 150,
  className,
}: {
  text: string;
  limit?: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();

  if (trimmed.length <= limit) {
    return <p className={className}>{trimmed}</p>;
  }

  let cut = trimmed.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > limit * 0.6) cut = cut.slice(0, lastSpace);

  return (
    <p className={className}>
      {expanded ? trimmed : `${cut.trimEnd()}… `}
      <button
        type="button"
        className="link-button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        {expanded ? "Mostrar menos" : "Mostrar más"}
      </button>
    </p>
  );
}
