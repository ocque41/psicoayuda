"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * h1 que recibe el foco al montar, para que un lector de pantalla anuncie la
 * llegada a la página (clave en el momento de espera tras pedir ayuda).
 */
export function FocusHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <h1 ref={ref} tabIndex={-1} style={{ outline: "none" }}>
      {children}
    </h1>
  );
}
