import Image from "next/image";
import { PARTNERS } from "@/lib/partners";
import { toIntlNumber } from "@/lib/phone";

// Escaparate de organizaciones aliadas verificadas. Lista curada
// (`src/lib/partners.ts`). Contacto directo por WhatsApp/llamada, mismo patrón
// "libro amarillo" que las fichas de profesionales.
export function PartnersShowcase() {
  if (PARTNERS.length === 0) return null;

  return (
    <section className="section" id="aliados">
      <div className="container">
        <h2>Organizaciones aliadas</h2>
        <p className="lead">
          Caminamos junto a organizaciones verificadas que también acompañan la
          salud mental. Si tú o alguien que conoces necesita su apoyo, aquí
          tienes cómo contactarlas.
        </p>
        <ul className="partners-grid" aria-label="Organizaciones aliadas">
          {PARTNERS.map((partner) => {
            const intl = partner.phone ? toIntlNumber(partner.phone) : null;
            const waText = encodeURIComponent(
              `Hola ${partner.name}, te contacto desde Nido (saludmental-venezuela.com).`,
            );
            return (
              <li className="card partner-card" key={partner.id}>
                <Image
                  className="partner-logo"
                  src={partner.logo}
                  width={96}
                  height={96}
                  alt={partner.name}
                />
                <h3 className="partner-name">{partner.name}</h3>
                {partner.tagline ? (
                  <p className="partner-tagline">{partner.tagline}</p>
                ) : null}
                {intl ? (
                  <div className="partner-contact">
                    <a
                      className="button human block"
                      href={`https://wa.me/${intl}?text=${waText}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Escribir por WhatsApp · {partner.phone}
                    </a>
                    <a className="muted" href={`tel:+${intl}`}>
                      o llamar al {partner.phone}
                    </a>
                  </div>
                ) : null}
                {partner.url ? (
                  <a
                    className="muted"
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visitar su web
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
