import { createConversation } from "@/app/actions-chat";
import { needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import { toIntlNumber } from "@/lib/phone";
import {
  isAvailableNow,
  professionalResponseSignal,
} from "@/lib/response-bucket";

function areaName(code: string) {
  return needLabels[code as keyof typeof needLabels] ?? code;
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

  // El chat en la app es secundario: cuando hay WhatsApp, va plegado.
  const chatForm = (
    <form action={createConversation}>
      <input type="hidden" name="professionalId" value={professional.id} />
      <div className="field">
        <label htmlFor={`name-${professional.id}`}>
          ¿Cómo quieres que te llame? (opcional)
        </label>
        <input
          id={`name-${professional.id}`}
          name="seekerName"
          type="text"
          maxLength={40}
          autoComplete="off"
          placeholder="Un nombre o apodo"
        />
      </div>
      <button className="button human block" type="submit">
        Hablar con {professional.name}
      </button>
    </form>
  );

  return (
    <article className="card pro-card">
      <div className="pro-card-head">
        {professional.photo ? (
          // biome-ignore lint/performance/noImgElement: avatar es un data URL pequeño desde la BD; next/image no aplica
          <img
            className="avatar"
            src={professional.photo}
            alt=""
            aria-hidden="true"
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
        <p className="pro-bio">{professional.shortBio}</p>
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
                Escribir por WhatsApp · {professional.phone}
              </a>
              <a
                className="muted"
                href={`tel:+${intlWhatsApp}`}
                style={{ display: "inline-block", marginTop: "6px" }}
              >
                o llamar al {professional.phone}
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
              {professional.landline}
            </a>
          ) : null}
          <a
            className="muted"
            href={`mailto:${professional.email}`}
            style={{ display: "block", marginTop: "6px" }}
          >
            {hasPhone ? "o escribir a " : "Escribir a "}
            {professional.email}
          </a>
        </div>

        {available ? (
          hasPhone ? (
            <details style={{ marginTop: "12px" }}>
              <summary className="muted">
                Prefiero escribir por aquí (sin salir de Nido)
              </summary>
              <div style={{ marginTop: "10px" }}>{chatForm}</div>
            </details>
          ) : (
            chatForm
          )
        ) : hasPhone ? null : (
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
      </div>
    </article>
  );
}
