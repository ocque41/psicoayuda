import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountActions } from "@/components/account-actions";
import {
  type ExistingProfessional,
  ProfessionalOnboardingForm,
} from "@/components/professional-onboarding-form";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";

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

export default async function ProOnboardingPage() {
  const session = await getServerSession();
  if (!session?.user?.email) redirect("/pro");
  // Los admins no son profesionales: no pasan por el onboarding. Como el callback
  // de login apunta aquí, este es el chokepoint que los desvía a su panel.
  if (isAdminEmail(session.user.email)) redirect("/admin");

  // Si ya hay perfil, el formulario se PRECARGA con sus datos: editar nunca
  // debe partir de un formulario en blanco (machacaba el perfil con vacíos).
  const profile = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });

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
        acceptingRequests: profile.acceptingRequests,
        crisisExperience: profile.crisisExperience,
        shortBio: profile.shortBio,
        emailPublic: profile.emailPublic,
        phone: profile.phone,
        landline: profile.landline,
        contactEmail: profile.contactEmail,
        contactNotes: profile.contactNotes,
      }
    : null;

  return (
    <section className="section">
      <div className="container">
        {existing ? (
          <>
            <p>
              <Link className="button secondary" href="/pro/dashboard">
                ← Volver a tu panel
              </Link>
            </p>
            <h1>Edita tu información</h1>
            <p className="muted">
              Tus datos actuales ya están cargados: cambia lo que necesites y
              guarda. Tus casos, chats y estado no se tocan.
            </p>
          </>
        ) : (
          <>
            <p>
              <Link className="button secondary" href="/">
                ← Volver al inicio
              </Link>
            </p>
            <h1>Onboarding profesional</h1>
            <p className="muted">
              Estos datos quedan pendientes de verificación por un coordinador.
            </p>
          </>
        )}
        <ProfessionalOnboardingForm
          email={session.user.email}
          name={session.user.name}
          existing={existing}
        />
        <AccountActions />
      </div>
    </section>
  );
}
