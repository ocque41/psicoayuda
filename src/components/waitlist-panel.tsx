import Link from "next/link";
import { createWaitlistEntry } from "@/app/actions-waitlist";
import { WaitlistForm } from "@/components/waitlist-form";
import type { WaitlistSource } from "@/lib/waitlist";

/**
 * Sección completa de la lista de espera: explicación + formulario. Es el
 * bloque que deja claro, ANTES de contactar con el directorio, que la ayuda
 * gratuita está reservada para las víctimas del terremoto y cuáles son los dos
 * caminos de quien no lo es (lista de espera o asociaciones aliadas).
 *
 * Se usa antes del catálogo de /profesionales, en /ayuda y en la página
 * dedicada /lista-de-espera. El `source` mide desde dónde se anotó la persona.
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
        <p className="eyebrow">Antes de contactar</p>
        <h2 id={titleId}>¿No eres víctima del terremoto?</h2>
        <p className="lead">
          El acompañamiento de Nido es{" "}
          <strong>gratis solo para las víctimas del terremoto</strong>. Si no
          eres víctima pero igual quieres apoyo psicológico, tienes dos caminos:
        </p>
        <ul className="waitlist-options">
          <li>
            <strong>Anótate en la lista de espera.</strong> Déjanos tu correo y
            cuéntanos qué necesitas. Te escribiremos cuando haya un profesional
            voluntario disponible para acompañarte.
          </li>
          <li>
            <strong>Encuentra ayuda en una de las asociaciones aliadas.</strong>{" "}
            <Link href="/alianzas">Ver organizaciones aliadas →</Link>
          </li>
        </ul>
      </section>
      <WaitlistForm action={createWaitlistEntry} source={source} />
      <p className="hint waitlist-panel-hint">
        ¿Eres víctima del terremoto? Entonces la ayuda es gratuita y no
        necesitas anotarte aquí: puedes{" "}
        <Link href="/ayuda">pedir apoyo ahora</Link> o{" "}
        <Link href="/profesionales">elegir a quién escribirle</Link>.
      </p>
    </div>
  );
}
