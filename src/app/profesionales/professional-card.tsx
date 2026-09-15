import { createConversation } from "@/app/actions-chat";
import { ExpandableText } from "@/components/expandable-text";
import { needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { toIntlNumber } from "@/lib/phone";
import {
  isAvailableNow,
  professionalResponseSignal,
} from "@/lib/response-bucket";
import { withUtm } from "@/lib/utm";

function areaName(code: string) {
  return needLabels[code as keyof typeof needLabels] ?? code;
}

/** Glifo de WhatsApp (mismo trazo en todos los tamaños, sin fondo). */
function WhatsAppMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export function FeedProfessionalCard({
  professional,
}: {
  professional: FeedProfessional;
}) {
  const signal = professionalResponseSignal(professional);
  const available = isAvailableNow(professional);
  const initial = professional.name.charAt(0).toUpperCase() || "·";

  // Contacto directo (libro amarillo). WhatsApp → wa.me + llamada; fijo → llamada;
  // correo → mailto. Cada método aparece solo si el profesional lo dio.
  const intlWhatsApp = toIntlNumber(professional.phone);
  const intlLandline = toIntlNumber(professional.landline);
  const hasPhone = Boolean(intlWhatsApp || intlLandline);
  const waText = encodeURIComponent(
    `Hola ${professional.name}, te contacto desde Nido (saludmental-venezuela.com). Me gustaría hablar contigo.`,
  );

  // WhatsApp y demás vías telefónicas, sin fondo: quedan debajo del chat.
  const phoneLinks = (
    <div className="pro-contact">
      {intlWhatsApp ? (
        <>
          <a
            className="pro-contact-wa"
            data-track-label={professional.name}
            href={withUtm(`https://wa.me/${intlWhatsApp}?text=${waText}`, {
              medium: "whatsapp",
              campaign: "profesionales",
              content: "professional-card",
            })}
            target="_blank"
            rel="noopener noreferrer"
          >
            <WhatsAppMark />
            Escribir por WhatsApp · {professional.phone}
          </a>
          <a
            className="pro-contact-muted"
            data-track-label={professional.name}
            href={`tel:+${intlWhatsApp}`}
          >
            o llamar al {professional.phone}
          </a>
        </>
      ) : null}
      {intlLandline ? (
        <a
          className="pro-contact-muted"
          data-track-label={professional.name}
          href={`tel:+${intlLandline}`}
        >
          {intlWhatsApp ? "o llamar al fijo " : "Llamar al "}
          {professional.landline}
        </a>
      ) : null}
      {professional.emailPublic ? (
        <a
          className="pro-contact-muted"
          data-track-label={professional.name}
          href={`mailto:${professional.email}`}
        >
          {hasPhone ? "o escribir a " : "Escribir a "}
          {professional.email}
        </a>
      ) : null}
    </div>
  );

  return (
    <article className="card pro-card">
      <div className="pro-card-head">
        {professional.photo ? (
          // biome-ignore lint/performance/noImgElement: avatar servido por /foto/[id] (cacheable); next/image no aplica a usuarios de BD
          <img
            className="avatar"
            src={professional.photo}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <span className="avatar" aria-hidden="true">
            {initial}
          </span>
        )}
        <div>
          <h3>{professional.name}</h3>
          {professional.city ? (
            <p className="muted pro-loc">
              {professional.city}
              {professional.country ? `, ${professional.country}` : ""}
            </p>
          ) : null}
        </div>
      </div>

      <p className={`badge badge-${signal.tone}`}>{signal.label}</p>

      {professional.nonClinicalHelper ? (
        <p
          className="badge badge-new"
          title="Acompaña de forma no clínica; no es un profesional con licencia."
        >
          Auxiliar no Clínico
        </p>
      ) : null}

      {professional.inPersonAvailable ? (
        <p
          className="badge badge-new"
          title="Además de a distancia, puede atender de forma presencial."
        >
          También presencial
          {professional.city ? ` · ${professional.city}` : ""}
        </p>
      ) : null}

      {professional.offersPaidServices ? (
        <p
          className="badge badge-new"
          title="La ayuda por el terremoto sigue siendo gratis. Además, ofrece servicios pagos por otros temas; puedes pedirle detalles sin compromiso."
        >
          También servicios pagos
        </p>
      ) : null}

      {professional.supportAreas.length ? (
        <ul className="chips" aria-label="Áreas de apoyo">
          {professional.supportAreas.slice(0, 4).map((area) => (
            <li key={area}>{areaName(area)}</li>
          ))}
          {professional.crisisExperience ? (
            <li className="chip-strong">Experiencia en crisis</li>
          ) : null}
        </ul>
      ) : null}

      {professional.shortBio ? (
        <ExpandableText
          text={professional.shortBio}
          className="pro-bio"
          limit={150}
        />
      ) : null}

      <div className="pro-card-actions">
        {professional.nonClinicalHelper ? (
          <p className="hint" style={{ margin: "0 0 8px" }}>
            Es un <strong>auxiliar no clínico</strong>: acompaña con empatía,
            pero no es un profesional con licencia.
          </p>
        ) : null}
        {available ? (
          <form action={createConversation} className="pro-chat-main">
            <input
              type="hidden"
              name="professionalId"
              value={professional.id}
            />
            <button
              className="button human block"
              type="submit"
              data-track="chat_start"
              data-track-label={professional.name}
            >
              Contactar ahora
            </button>
          </form>
        ) : (
          <button
            className="button secondary block"
            type="button"
            disabled
            aria-disabled="true"
            title="Esta persona no tiene cupo en este momento"
          >
            Sin cupo ahora mismo
          </button>
        )}
        {phoneLinks}
      </div>
    </article>
  );
}
