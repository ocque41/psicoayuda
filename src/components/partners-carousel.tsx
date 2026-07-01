// biome-ignore-all lint/a11y/noNoninteractiveTabindex: el carrusel horizontal debe poder recibir foco para desplazarse con teclado
import Image from "next/image";
import { PARTNERS, type Partner } from "@/lib/partners";
import { toIntlNumber } from "@/lib/phone";

// Enlace de contacto DIRECTO de un aliado, tal cual lo dejó él: WhatsApp con su
// teléfono si lo tiene; si no, su web. Devuelve null si no dejó ninguna vía (la
// tarjeta se muestra igual, pero sin enlace).
function partnerContact(
  partner: Partner,
): { href: string; label: string; external: boolean } | null {
  const intl = partner.phone ? toIntlNumber(partner.phone) : null;
  if (intl) {
    const waText = encodeURIComponent(
      `Hola ${partner.name}, te contacto desde Nido (saludmental-venezuela.com).`,
    );
    return {
      href: `https://wa.me/${intl}?text=${waText}`,
      label: `WhatsApp · ${partner.phone}`,
      external: true,
    };
  }
  if (partner.url) {
    return { href: partner.url, label: "Visitar su web", external: true };
  }
  return null;
}

// Carrusel de aliados para la portada: una tira horizontal, arriba del todo, de
// tarjetas que se deslizan. Al hacer clic, cada tarjeta lleva directo al contacto
// que el aliado dejó (WhatsApp o su web). El escaparate detallado vive en
// /alianzas (PartnersShowcase). Patrón scroll-snap igual que HomeProfessionalsStrip.
export function PartnersCarousel() {
  if (PARTNERS.length === 0) return null;

  return (
    <section className="section partners-carousel-section" id="aliados">
      <div className="container">
        <h2>Organizaciones aliadas</h2>
        <p className="lead">
          Caminamos junto a organizaciones verificadas que también acompañan la
          salud mental. Toca una para contactarla directamente.
        </p>
        {/* tabIndex=0: Firefox y Safari no hacen enfocables por teclado los
            contenedores con overflow; sin esto no se podría desplazar la tira
            con teclado (WCAG 2.1.1). El aria-label le da nombre. */}
        <ul
          className="partners-carousel"
          aria-label="Organizaciones aliadas"
          tabIndex={0}
        >
          {PARTNERS.map((partner) => {
            const contact = partnerContact(partner);
            const inner = (
              <>
                <Image
                  className="partner-logo"
                  src={partner.logo}
                  width={72}
                  height={72}
                  alt={partner.name}
                />
                <span className="partner-name">{partner.name}</span>
                {partner.tagline ? (
                  <span className="partner-tagline">{partner.tagline}</span>
                ) : null}
                {contact ? (
                  <span className="partner-cta">{contact.label}</span>
                ) : null}
              </>
            );
            return (
              <li className="partner-slide" key={partner.id}>
                {contact ? (
                  <a
                    className="card partner-link"
                    href={contact.href}
                    target={contact.external ? "_blank" : undefined}
                    rel={contact.external ? "noopener noreferrer" : undefined}
                  >
                    {inner}
                  </a>
                ) : (
                  <div className="card partner-link">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
