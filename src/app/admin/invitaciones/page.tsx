import type { Metadata } from "next";
import Link from "next/link";
import {
  adminNavigation,
  admissionNavigation,
  paolaPreviewNavigation,
} from "@/components/admin/navigation";
import { adminSearchValue } from "@/components/admin/search-params";
import { AdminShell } from "@/components/admin/shell";
import { AuthPanel } from "@/components/auth-panel";
import { ProfessionalInvitationPanel } from "@/components/professional-invitation-panel";
import { requireAdmissionReviewer } from "@/lib/admission/access";
import { getServerSession } from "@/lib/auth-server";
import { buildProfessionalInvitation } from "@/lib/contact-messages";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Invitar a colegas",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requestedPaolaView = adminSearchValue(query.vista) === "paola";
  const callbackURL = requestedPaolaView
    ? "/admin/invitaciones?vista=paola"
    : "/admin/invitaciones";
  const actor = await requireAdmissionReviewer();
  if (!actor) {
    const session = await getServerSession();
    return (
      <section className="section">
        <div className="container">
          <h1>Invitaciones profesionales</h1>
          {session?.user ? (
            <div className="card">
              <p>
                Esta cuenta no tiene acceso a las invitaciones de admisión.
                Necesitas una cuenta verificada autorizada para revisar nuevas
                candidaturas profesionales.
              </p>
            </div>
          ) : (
            <div className="signin">
              <p>Entra con tu cuenta para invitar a colegas desde admisión.</p>
              <AuthPanel
                callbackURL={callbackURL}
                googleEnabled={Boolean(
                  process.env.GOOGLE_CLIENT_ID?.trim() &&
                    process.env.GOOGLE_CLIENT_SECRET?.trim(),
                )}
              />
            </div>
          )}
        </div>
      </section>
    );
  }

  const paolaView = actor.isAdmin && requestedPaolaView;
  const items = actor.isAdmin
    ? paolaView
      ? paolaPreviewNavigation
      : adminNavigation
    : admissionNavigation;
  const accountLabel = actor.isAdmin
    ? paolaView
      ? "Superadmin · vista del rol de admisión"
      : "Superadmin"
    : "Administración de psicólogos";
  const invitation = buildProfessionalInvitation({
    siteUrl: SITE_URL,
    source: "admission",
  });

  return (
    <AdminShell
      active="invitaciones"
      items={items}
      accountEmail={actor.email}
      accountLabel={accountLabel}
      title="Invitar a colegas"
    >
      {actor.isAdmin ? (
        <div className="card">
          {paolaView ? (
            <p>
              Sigues usando tu cuenta de Superadmin. Esta vista muestra las
              invitaciones del rol de admisión.
            </p>
          ) : null}
          <Link
            className="button secondary"
            href={
              paolaView
                ? "/admin/invitaciones"
                : "/admin/invitaciones?vista=paola"
            }
          >
            {paolaView ? "Vista de Superadmin" : "Vista de Paola"}
          </Link>
        </div>
      ) : null}
      <ProfessionalInvitationPanel {...invitation} />
    </AdminShell>
  );
}
