import { gt } from "drizzle-orm";
import type { Metadata } from "next";
import { OrientationChat } from "@/components/practice/orientation-chat";
import { db } from "@/db";
import { practiceCredentials } from "@/db/schema";
import { countries } from "@/lib/constants";
import { getCachedFeedProfessionals } from "@/lib/feed";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Encuentra con quién hablar",
  description:
    "Unas preguntas breves para encontrar profesionales afines a lo que necesitas, en tu idioma y según tu ubicación.",
  alternates: { canonical: "/orientacion" },
};
export default async function OrientationPage() {
  const [professionals, credentials] = await Promise.all([
    getCachedFeedProfessionals(),
    db
      .select({
        professionalId: practiceCredentials.professionalId,
        country: practiceCredentials.patientCountry,
      })
      .from(practiceCredentials)
      .where(gt(practiceCredentials.expiresAt, new Date().toISOString())),
  ]);
  const scopesByProfessional = new Map<string, string[]>();
  for (const scope of credentials) {
    const countries = scopesByProfessional.get(scope.professionalId) || [];
    countries.push(scope.country);
    scopesByProfessional.set(scope.professionalId, countries);
  }
  const profiles = professionals
    .filter((p) => !p.nonClinicalHelper)
    .map((p) => ({
      id: p.id,
      name: p.name,
      supportAreas: p.supportAreas,
      languages: p.languages,
      eligibleCountries: scopesByProfessional.get(p.id) || [],
      available:
        p.acceptingRequests && p.currentActiveRequests < p.maxActiveRequests,
      supportsMinors: p.supportAreas.includes("infancia_adolescencia"),
    }));
  return (
    <section className="section">
      <div className="container">
        <p className="eyebrow">A tu ritmo</p>
        <h1 style={{ textAlign: "center" }}>Encuentra con quién hablar</h1>
        <OrientationChat profiles={profiles} countries={[...countries]} />
      </div>
    </section>
  );
}
