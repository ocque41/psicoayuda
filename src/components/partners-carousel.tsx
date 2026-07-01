// biome-ignore-all lint/a11y/noNoninteractiveTabindex: el carrusel horizontal debe poder recibir foco para desplazarse con teclado
import {
  getPublishedPartners,
  isExternalHref,
  partnerCarouselHref,
} from "@/lib/partners";

// Carrusel de aliados para la portada: una tira horizontal, arriba del todo, de
// logos que se deslizan. Al hacer clic, cada uno lleva directo al contacto del
// aliado (o a su ficha en /alianzas si tiene varias vías). Si un aliado no tiene
// logo, se muestra su nombre "en limpio". La ficha completa (especialidad,
// descripción y todos los contactos) vive en /alianzas (PartnersShowcase).
export async function PartnersCarousel() {
  const partners = await getPublishedPartners();
  if (partners.length === 0) return null;

  return (
    <section className="section partners-carousel-section" id="aliados">
      <div className="container">
        <h2>Organizaciones aliadas</h2>
        <p className="lead">
          Caminamos junto a organizaciones verificadas que también acompañan la
          salud mental. Toca una para contactarla.
        </p>
        {/* tabIndex=0: Firefox y Safari no hacen enfocables por teclado los
            contenedores con overflow; sin esto no se podría desplazar la tira
            con teclado (WCAG 2.1.1). El aria-label le da nombre. */}
        <ul
          className="partners-carousel"
          aria-label="Organizaciones aliadas"
          tabIndex={0}
        >
          {partners.map((partner) => {
            const href = partnerCarouselHref(partner);
            const external = isExternalHref(href);
            return (
              <li className="partner-slide" key={partner.id}>
                <a
                  className="card partner-link"
                  href={href}
                  aria-label={`Contactar a ${partner.name}`}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                >
                  {partner.logo ? (
                    // <img> (no next/image) para admitir URL, data URL o ruta
                    // local sin configurar remotePatterns. Igual que los avatares.
                    // biome-ignore lint/performance/noImgElement: logo arbitrario desde BD (URL/data URL); next/image no aplica
                    <img
                      className="partner-logo"
                      src={partner.logo}
                      alt={partner.name}
                      width={72}
                      height={72}
                      loading="lazy"
                    />
                  ) : (
                    <span className="partner-namechip">{partner.name}</span>
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
