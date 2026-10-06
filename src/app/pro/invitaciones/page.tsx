import { and, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthPanel } from "@/components/auth-panel";
import { PracticeNav } from "@/components/practice/nav";
import { ProfessionalInvitationPanel } from "@/components/professional-invitation-panel";
import { db } from "@/db";
import { session as authSessions, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { buildProfessionalInvitation } from "@/lib/contact-messages";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Invitar a colegas a Nido",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

async function canInviteWithLiveSession(
  professionalId: string,
  current: NonNullable<Awaited<ReturnType<typeof getServerSession>>>,
) {
  if (!current.session?.id) return false;
  const expiry = new Date(current.session.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return false;
  // Sólo identidad y vigencia: no cargar documentos ni la ficha profesional.
  const [live] = await db
    .select({
      professionalId: professionals.id,
      userId: professionals.userId,
      authSessionId: authSessions.id,
      expiresAt: authSessions.expiresAt,
    })
    .from(professionals)
    .innerJoin(
      authSessions,
      and(
        eq(authSessions.userId, professionals.userId),
        eq(authSessions.id, current.session.id),
      ),
    )
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.userId, current.user.id),
        eq(professionals.status, "approved"),
        eq(professionals.nonClinicalHelper, false),
        sql`${authSessions.expiresAt} > cast(unixepoch('subsecond') * 1000 as integer)`,
      ),
    )
    .limit(1);
  return Boolean(
    live &&
      live.professionalId === professionalId &&
      live.userId === current.user.id &&
      live.authSessionId === current.session.id &&
      live.expiresAt.getTime() > Date.now(),
  );
}

export default async function ProfessionalInvitationsPage() {
  const session = await getServerSession();
  if (!session?.user.id) {
    return (
      <section className="section">
        <div className="container signin">
          <h1>Invita a colegas a Nido</h1>
          <p>Entra con tu cuenta para compartir el acceso a la consulta.</p>
          <AuthPanel
            callbackURL="/pro/invitaciones"
            googleEnabled={Boolean(
              process.env.GOOGLE_CLIENT_ID?.trim() &&
                process.env.GOOGLE_CLIENT_SECRET?.trim(),
            )}
          />
        </div>
      </section>
    );
  }
  const pro = await requirePracticeProfessional();
  if (!(await canInviteWithLiveSession(pro.id, session))) {
    return (
      <section className="section">
        <div className="container">
          <h1>Comprueba tu acceso</h1>
          <p>
            Vuelve a entrar con tu cuenta profesional para abrir este espacio.
          </p>
          <Link className="button human" href="/pro">
            Volver a entrar
          </Link>
        </div>
      </section>
    );
  }
  const invitation = buildProfessionalInvitation({
    siteUrl: SITE_URL,
    source: "professional",
  });
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Invitar a colegas</h1>
        <PracticeNav />
        <ProfessionalInvitationPanel {...invitation} />
      </div>
    </section>
  );
}
