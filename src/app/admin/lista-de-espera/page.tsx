import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { AdminWaitlistBoard } from "@/components/admin/waitlist/board";
import { AuthPanel } from "@/components/auth-panel";
import { requireWaitlistAdmin } from "@/lib/admin-waitlist/access";
import { readAdminWaitlistData } from "@/lib/admin-waitlist/queries";
import type { AdminWaitlistQuery } from "@/lib/admin-waitlist/types";
import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Lista de espera · Administración",
  robots: { index: false, follow: false },
};

export default async function AdminWaitlistPage({
  searchParams,
}: {
  searchParams: Promise<AdminWaitlistQuery>;
}) {
  const actor = await requireWaitlistAdmin();
  if (!actor) {
    const session = await getServerSession();
    return (
      <section className="section">
        <div className="container">
          <h1>Lista de espera</h1>
          {session?.user ? (
            <div className="card">
              <p>
                Esta cuenta no tiene acceso a la lista de espera. Se requiere
                una cuenta verificada de Superadmin.
              </p>
            </div>
          ) : (
            <div className="signin">
              <p>
                Entra con tu cuenta de Superadmin para consultar las listas de
                espera.
              </p>
              <AuthPanel
                callbackURL="/admin/lista-de-espera"
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
  const data = await readAdminWaitlistData(actor, await searchParams);
  return (
    <AdminShell
      active="lista-espera"
      accountEmail={actor.email}
      accountLabel="Superadmin"
      badges={{ "lista-espera": data.failed ? 0 : data.sourceCounts.general }}
    >
      <AdminWaitlistBoard data={data} />
    </AdminShell>
  );
}
