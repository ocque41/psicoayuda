import Image from "next/image";
import {
  type Organization,
  orgServiceLabels,
  orgSpecialtyLabels,
} from "@/lib/organizations";
import { toIntlNumber } from "@/lib/phone";

/**
 * Ficha pública de una organización aliada dentro del directorio de "pedir
 * ayuda". Mismo patrón "libro amarillo" que las fichas de profesional: muestra
 * enfoque, servicios y modalidad, y contacto directo (WhatsApp / llamada / correo
 * / web) tal cual lo dejó la organización. Cada vía aparece solo si existe.
 */
export function OrganizationCard({
  organization,
}: {
  organization: Organization;
}) {
  const initial = organization.name.charAt(0).toUpperCase() || "·";
  const intlWhatsApp = toIntlNumber(organization.phone);
  const intlLandline = toIntlNumber(organization.landline);
  const waText = encodeURIComponent(
    `Hola ${organization.name}, te contacto desde Nido (saludmental-venezuela.com).`,
  );

  return (
    <article className="card pro-card">
      <div className="pro-card-head">
        {organization.logo ? (
          <Image
            className="avatar"
            src={organization.logo}
            alt=""
            aria-hidden="true"
            width={56}
            height={56}
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
        )}
        <div>
          <h3>{organization.name}</h3>
          {organization.city ? (
            <p className="muted pro-loc">
              {organization.city}
              {organization.country ? `, ${organization.country}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <p className="badge badge-new" title="Organización aliada verificada.">
        Organización
      </p>

      {organization.tagline ? (
        <p className="pro-bio">{organization.tagline}</p>
      ) : null}

      {organization.specialties.length ? (
        <ul className="chips" aria-label="Enfoque">
          {organization.specialties.map((specialty) => (
            <li key={specialty} className="chip-strong">
              {orgSpecialtyLabels[specialty] ?? specialty}
            </li>
          ))}
        </ul>
      ) : null}

      {organization.services.length ? (
        <ul className="chips" aria-label="Servicios">
          {organization.services.map((service) => (
            <li key={service}>{orgServiceLabels[service] ?? service}</li>
          ))}
          {organization.virtual24h ? (
            <li className="chip-strong">Asistencia virtual 24 h</li>
          ) : null}
        </ul>
      ) : organization.virtual24h ? (
        <ul className="chips" aria-label="Modalidad">
          <li className="chip-strong">Asistencia virtual 24 h</li>
        </ul>
      ) : null}

      <div className="pro-card-actions">
        <div className="pro-contact">
          {intlWhatsApp ? (
            <>
              <a
                className="button human block"
                href={`https://wa.me/${intlWhatsApp}?text=${waText}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Escribir por WhatsApp · {organization.phone}
              </a>
              <a
                className="muted"
                href={`tel:+${intlWhatsApp}`}
                style={{ display: "inline-block", marginTop: "6px" }}
              >
                o llamar al {organization.phone}
              </a>
            </>
          ) : null}
          {intlLandline ? (
            <a
              className={intlWhatsApp ? "muted" : "button human block"}
              href={`tel:+${intlLandline}`}
              style={
                intlWhatsApp
                  ? { display: "block", marginTop: "6px" }
                  : undefined
              }
            >
              {intlWhatsApp ? "o llamar al fijo " : "Llamar al "}
              {organization.landline}
            </a>
          ) : null}
          {organization.email ? (
            <a
              className="muted"
              href={`mailto:${organization.email}`}
              style={{ display: "block", marginTop: "6px" }}
            >
              {intlWhatsApp || intlLandline ? "o escribir a " : "Escribir a "}
              {organization.email}
            </a>
          ) : null}
          {organization.url ? (
            <a
              className="muted"
              href={organization.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", marginTop: "6px" }}
            >
              Visitar su web
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
