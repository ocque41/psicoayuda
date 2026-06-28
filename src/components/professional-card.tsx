import { needLabels } from "@/lib/constants";

type ProfessionalCardProps = {
  displayName: string | null;
  fullName: string;
  languages: string;
  supportAreas: string;
  shortBio: string | null;
};

function parseJsonList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function ProfessionalCard({
  displayName,
  fullName,
  languages,
  supportAreas,
  shortBio,
}: ProfessionalCardProps) {
  const areas = parseJsonList(supportAreas)
    .map((area) => needLabels[area as keyof typeof needLabels] ?? area)
    .join(", ");

  return (
    <article className="card">
      <h3>{displayName || fullName.split(" ")[0] || "Profesional"}</h3>
      <p className="muted">Idiomas: {parseJsonList(languages).join(", ")}</p>
      <p>Apoyo remoto: {areas || "Orientación general"}</p>
      {shortBio ? <p>{shortBio}</p> : null}
    </article>
  );
}
