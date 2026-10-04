import Link from "next/link";
import "./waitlist.css";
import { WAITLIST_PATH } from "@/lib/waitlist";

/**
 * Aviso compacto (sin formulario) para páginas donde el formulario completo no
 * encaja: ofrece una alternativa al catálogo general sin prometer cupos ni
 * plazos. El formulario vive en /lista-de-espera; Ayuda Terremoto conserva su
 * recorrido gratuito separado.
 *
 * En /alianzas se oculta el enlace a las asociaciones (ya estás en esa página:
 * el escaparate está más abajo).
 */
export function WaitlistCallout({
  showAssociationsLink = true,
}: {
  showAssociationsLink?: boolean;
}) {
  return (
    <aside className="waitlist-callout" aria-label="Lista general de espera">
      <p>
        <strong>¿Buscas otras opciones de apoyo?</strong> Puedes{" "}
        <Link href={WAITLIST_PATH}>anotarte en la lista general de espera</Link>{" "}
        para que el equipo revise tu solicitud según disponibilidad
        {showAssociationsLink ? (
          <>
            {" "}
            o <Link href="/alianzas">explorar organizaciones aliadas</Link>
          </>
        ) : null}
        . No podemos garantizar un cupo ni un plazo de respuesta. El programa{" "}
        <Link href="/ayuda">Ayuda Terremoto</Link> mantiene su recorrido
        gratuito separado.
      </p>
    </aside>
  );
}
