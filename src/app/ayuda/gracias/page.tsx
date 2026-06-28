import { ProfessionalCard } from "@/components/professional-card";
import { suggestProfessionalsForRequest } from "@/lib/matching";

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ solicitud?: string }>;
}) {
  const params = await searchParams;
  const suggestions = params.solicitud
    ? await suggestProfessionalsForRequest(params.solicitud)
    : [];

  return (
    <section className="section">
      <div className="container">
        <h1>Solicitud recibida</h1>
        <p>
          Gracias. Un profesional o coordinador intentará contactarte por
          correo. Esto no garantiza disponibilidad inmediata.
        </p>
        {suggestions.length ? (
          <>
            <h2>Profesionales disponibles para revisión</h2>
            <p className="muted">
              Estos datos son informativos. El contacto final lo coordina
              PsicoAyuda.
            </p>
            <div className="grid grid-2">
              {suggestions.map(({ professional }) => (
                <ProfessionalCard
                  key={professional.id}
                  displayName={professional.displayName}
                  fullName={professional.fullName}
                  languages={professional.languages}
                  supportAreas={professional.supportAreas}
                  shortBio={professional.shortBio}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
