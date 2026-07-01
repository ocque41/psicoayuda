import {
  getPublishedPartners,
  isExternalHref,
  type PartnerContact,
  partnerContactHref,
  partnerContactText,
} from "@/lib/partners";

// Clase de botón/enlace según el tipo de contacto: WhatsApp como acción humana
// principal; el resto, secundario o enlace discreto.
function contactClass(type: PartnerContact["type"]) {
  if (type === "whatsapp") return "button human block";
  if (type === "phone") return "button secondary block";
  return "muted partner-contact-link";
}

// Escaparate de organizaciones aliadas verificadas (ficha completa). Datos en D1
// (`partners`), gestionados desde /admin. Cada tarjeta tiene un id para enlazar
// desde el carrusel de la portada (/alianzas#<id>). Contacto directo por
// WhatsApp/llamada, mismo patrón "libro amarillo" que las fichas de profesionales.
export async function PartnersShowcase() {
  const partners = await getPublishedPartners();
  if (partners.length === 0) return null;

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
          {partners.map((partner) => (
            <li className="card partner-card" id={partner.id} key={partner.id}>
              {partner.logo ? (
                // biome-ignore lint/performance/noImgElement: logo arbitrario desde BD (URL/data URL); next/image no aplica
                <img
                  className="partner-logo"
                  src={partner.logo}
                  alt={partner.name}
                  width={96}
                  height={96}
                  loading="lazy"
                />
              ) : (
                <span className="partner-namechip lg" aria-hidden="true">
                  {partner.name}
                </span>
              )}
              <h3 className="partner-name">{partner.name}</h3>
              {partner.specialty ? (
                <p className="partner-specialty">{partner.specialty}</p>
              ) : null}
              {partner.description ? (
                <p className="partner-tagline">{partner.description}</p>
              ) : null}
              {partner.contacts.length ? (
                <div className="partner-contact">
                  {partner.contacts.map((contact) => {
                    const href = partnerContactHref(contact);
                    if (!href) return null;
                    const external = isExternalHref(href);
                    return (
                      <a
                        key={`${contact.type}-${contact.value}`}
                        className={contactClass(contact.type)}
                        href={href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                      >
                        {partnerContactText(contact)}
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
