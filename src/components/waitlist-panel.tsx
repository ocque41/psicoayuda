import Link from "next/link";
import "./waitlist.css";
import { createWaitlistEntry } from "@/app/actions-waitlist";
import { WaitlistForm } from "@/components/waitlist-form";
import type { WaitlistSource } from "@/lib/waitlist";

/**
 * Sección completa de la lista de espera: explicación + formulario. Es el
 * bloque dedicado a solicitudes por motivos distintos del terremoto, sin
 * sustituir el catálogo general ni el recorrido gratuito de Ayuda Terremoto.
 * El `source` identifica desde dónde se anotó la persona.
 */
export function WaitlistPanel({
  source,
  id = "lista-de-espera",
}: {
  source: WaitlistSource;
  id?: string;
}) {
  const titleId = `${id}-titulo`;

  return (
    <div className="waitlist-panel" id={id}>
      <section className="waitlist-panel-copy" aria-labelledby={titleId}>
        <p className="eyebrow">Otras opciones de apoyo</p>
        <h2 id={titleId}>Lista general de espera</h2>
        <p className="lead">
          El programa Ayuda Terremoto ofrece acompañamiento{" "}
          <strong>gratuito a las personas afectadas por el terremoto</strong>.
          Si buscas apoyo por otro motivo, puedes usar estos recursos:
        </p>
        <ul className="waitlist-options">
          <li>
            <strong>Anótate en la lista de espera.</strong> Déjanos tu correo y
            cuéntanos brevemente qué necesitas. El equipo revisa las solicitudes
            según disponibilidad; no podemos garantizar un cupo ni un plazo de
            respuesta.
          </li>
          <li>
            <strong>Explora las organizaciones aliadas.</strong>{" "}
            <Link href="/alianzas">Ver organizaciones aliadas →</Link>
          </li>
        </ul>
      </section>
      <WaitlistForm action={createWaitlistEntry} source={source} />
      <p className="hint waitlist-panel-hint">
        Si buscas apoyo por el terremoto, consulta el programa separado de{" "}
        <Link href="/ayuda">
          Ayuda Terremoto, gratuito según disponibilidad
        </Link>
        . También puedes{" "}
        <Link href="/profesionales">explorar el catálogo general</Link>.
      </p>
    </div>
  );
}
