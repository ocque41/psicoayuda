import { eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account-actions";
import { ConversionBeacon } from "@/components/conversion-beacon";
import {
  type ExistingProfessional,
  ProfessionalOnboardingForm,
} from "@/components/professional-onboarding-form";
import { db } from "@/db";
import { practiceSettings, professionals } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { readOnboardingDraft } from "@/lib/onboarding/drafts";
import { requirePracticeStaff } from "@/lib/practice/staff";

export const metadata: Metadata = {
  title: "Tu información profesional",
  robots: { index: false, follow: false },
};

function parseJsonList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export default async function ProOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ conversion?: string }>;
}) {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/pro");
  // Los admins no son profesionales: no pasan por el onboarding. Como el callback
  // de login apunta aquí, este es el chokepoint que los desvía a su panel.
  if (await requireAdmin()) redirect("/admin");
  if (
    (await requirePracticeStaff("support")) ||
    (await requirePracticeStaff("credentials"))
  )
    redirect("/admin/operaciones");

  // Si ya hay perfil, el formulario se PRECARGA con sus datos: editar nunca
  // debe partir de un formulario en blanco (machacaba el perfil con vacíos).
  const profile = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
    columns: { registrationProofDoc: false },
    extras: {
      hasProof:
        sql<boolean>`coalesce(length(${professionals.registrationProofDoc}), 0) > 0`
          .mapWith(Boolean)
          .as("has_proof"),
    },
  });
  const [draft, settings] = await Promise.all([
    readOnboardingDraft(session.user.id, "pro"),
    profile
      ? db
          .select({ timeZone: practiceSettings.timeZone })
          .from(practiceSettings)
          .where(eq(practiceSettings.professionalId, profile.id))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const { conversion } = await searchParams;

  const existing: ExistingProfessional | null = profile
    ? {
        fullName: profile.fullName,
        displayName: profile.displayName,
        country: profile.country,
        city: profile.city,
        photo: profile.photo,
        nonClinicalHelper: profile.nonClinicalHelper,
        fpvNumber: profile.fpvNumber,
        supervisionInfo: profile.supervisionInfo,
        licenseNumber: profile.licenseNumber,
        licenseCountry: profile.licenseCountry,
        university: profile.university,
        supportAreas: parseJsonList(profile.supportAreas),
        maxActiveRequests: profile.maxActiveRequests,
        remoteAvailable: profile.remoteAvailable,
        inPersonAvailable: profile.inPersonAvailable,
        acceptingRequests: profile.acceptingRequests,
        crisisExperience: profile.crisisExperience,
        offersPaidServices: profile.offersPaidServices,
        shortBio: profile.shortBio,
        emailPublic: profile.emailPublic,
        phone: profile.phone,
        landline: profile.landline,
        contactEmail: profile.contactEmail,
        contactNotes: profile.contactNotes,
        registrationType: profile.registrationType,
        registrationDetail: profile.registrationDetail,
        hasRegistrationProof: profile.hasProof,
        timezone: settings[0]?.timeZone ?? null,
      }
    : null;

  return (
    <section className="section">
      <div className="container">
        {conversion === "signup" ? (
          <ConversionBeacon
            type="signup"
            dedupeKey={session.user.id}
            removeSearchParam="conversion"
          />
        ) : null}
        {existing ? (
          <>
            <p>
              <Link className="button secondary" href="/pro/dashboard">
                ← Volver a tu panel
              </Link>
            </p>
            <h1>Tu perfil, a tu ritmo</h1>
            <p className="muted">
              Tus datos actuales ya están cargados: cambia lo que necesites y
              guarda al terminar. Si cambias una credencial, el equipo revisará
              de nuevo tu perfil y los países de atención. Las conversaciones y
              el historial se conservan.
            </p>
          </>
        ) : (
          <>
            <p>
              <Link className="button secondary" href="/">
                ← Volver al inicio
              </Link>
            </p>
            <h1>Prepara tu consulta en Nido</h1>
            <p className="muted">
              Una pregunta a la vez. Guardamos tu progreso básico en tu cuenta
              durante siete días. Los documentos y datos de credenciales se
              envían al terminar; después, una persona del equipo revisa tu
              incorporación.
            </p>
          </>
        )}
        <ProfessionalOnboardingForm
          key={session.user.id}
          ownerId={session.user.id}
          email={session.user.email}
          name={session.user.name}
          existing={existing}
          draft={draft}
        />
        <AccountActions />
      </div>
    </section>
  );
}
