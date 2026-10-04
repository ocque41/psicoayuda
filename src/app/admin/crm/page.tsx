import type { Metadata } from "next";
import { CrmReview } from "@/components/admin/crm-review";
import { adminSearchValue } from "@/components/admin/search-params";
import { AdminShell } from "@/components/admin/shell";
import { AuthPanel } from "@/components/auth-panel";
import { requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { calendarMonth, calendarReferenceDay } from "@/lib/practice/calendar";
import { reviewWindow } from "@/lib/practice/review-navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CRM profesional · Revisión",
  robots: { index: false, follow: false },
};

export default async function CrmReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  if (!admin) {
    const session = await getServerSession();
    return (
      <section className="section">
        <div className="container">
          <h1>CRM profesional</h1>
          {session?.user ? (
            <div className="card">
              <p>
                Esta cuenta no tiene acceso a la revisión administrativa del
                CRM.
              </p>
              <p>Entra con una cuenta administradora verificada.</p>
            </div>
          ) : (
            <div className="signin">
              <p>
                Entra con una cuenta administradora para revisar la consulta
                profesional.
              </p>
              <AuthPanel
                callbackURL="/admin/crm"
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
  const query = await searchParams;
  const zone = "America/Caracas";
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: zone }).format(
    new Date(),
  );
  const month = calendarMonth(adminSearchValue(query.mes), today.slice(0, 7));
  return (
    <AdminShell active="crm" accountEmail={admin.email}>
      <CrmReview
        window={reviewWindow(adminSearchValue(query.ventana))}
        month={month}
        day={calendarReferenceDay(month, adminSearchValue(query.dia), zone)}
        timeZone={zone}
      />
    </AdminShell>
  );
}
