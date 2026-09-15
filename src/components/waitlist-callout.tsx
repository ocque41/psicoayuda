import Link from "next/link";
import { WAITLIST_PATH } from "@/lib/waitlist";

/**
 * Aviso compacto (sin formulario) para páginas donde el formulario completo no
 * encaja: deja claro que la ayuda gratuita es para las víctimas del terremoto y
 * ofrece los dos caminos de quien no lo es. El formulario vive en
 * /lista-de-espera y antes del catálogo de /profesionales.
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
    <aside
      className="waitlist-callout"
      aria-label="Lista de espera para quienes no son víctimas del terremoto"
    >
      <p>
        <strong>¿No eres víctima del terremoto?</strong> La ayuda gratuita de
        Nido está reservada para las víctimas del terremoto. Si necesitas apoyo
        psicológico por otro motivo,{" "}
        <Link href={WAITLIST_PATH}>anótate en la lista de espera</Link>
        {showAssociationsLink ? (
          <>
            {" "}
            o{" "}
            <Link href="/alianzas">
              encuentra ayuda en una de las asociaciones aliadas
            </Link>
          </>
        ) : null}
        .
      </p>
    </aside>
  );
}
