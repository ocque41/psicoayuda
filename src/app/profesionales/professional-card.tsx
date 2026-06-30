import Link from "next/link";
import { createConversation } from "@/app/actions-chat";
import { languageLabels, needLabels } from "@/lib/constants";
import type { FeedProfessional } from "@/lib/feed";
import {
  isAvailableNow,
  professionalResponseSignal,
} from "@/lib/response-bucket";

function langName(code: string) {
  return languageLabels[code as keyof typeof languageLabels] ?? code;
}

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

  return (
    <article className="card pro-card">
      <div className="pro-card-head">
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
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

      {professional.languages.length ? (
        <p className="muted pro-langs">
          Atiende en: {professional.languages.map(langName).join(", ")}
        </p>
      ) : null}

      {professional.shortBio ? (
        <p className="pro-bio">{professional.shortBio}</p>
      ) : null}

      <div className="pro-card-actions">
        {available ? (
          <form action={createConversation}>
            <input
              type="hidden"
              name="professionalId"
              value={professional.id}
            />
            <button className="button human block" type="submit">
              Hablar con {professional.name}
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
      </div>
    </article>
  );
}
