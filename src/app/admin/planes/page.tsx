import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  migrateAll,
  migrateOne,
  resendOne,
  revertOne,
} from "@/app/admin/planes/actions";
import { AdminShell } from "@/components/admin/shell";
import { PracticeForm } from "@/components/practice/forms";
import { requireAdmin } from "@/lib/admin";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  EXISTING_PROFESSIONAL_TRIAL_DAYS,
  existingProfessionalTrialEnd,
  formatMembershipPrice,
  formatTrialDate,
  MEMBERSHIP_ACCESS_STATUSES,
  trialActive,
} from "@/lib/practice/membership-plan";
import { migrationEmailContent } from "@/lib/practice/plan-emails";
import { listPlanProfessionals } from "@/lib/practice/plan-migration";

export const metadata: Metadata = {
  title: "Planes · Administración",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  none: "Sin plan",
  trialing: "En prueba",
  active: "Activo",
  past_due: "Pago pendiente",
  canceled: "Cancelado",
  incomplete: "Pendiente",
  incomplete_expired: "Sin confirmar",
  unpaid: "Sin pagar",
  paused: "En pausa",
};

export default async function AdminPlansPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/admin");
  const ready = membershipBillingReady();
  const rows = await listPlanProfessionals();
  const legacy = rows.filter((row) => row.accessPlan !== "subscription");
  const preview = migrationEmailContent({
    email: "",
    name: "Nombre",
    currency: "usd",
    trialEndsAt: existingProfessionalTrialEnd(),
  });
  return (
    <AdminShell
      active="planes"
      accountEmail={admin.email}
      title="Planes del software"
      description="Quién está en el plan anterior y quién en suscripción. Cambiar un perfil nunca borra sus datos."
    >
      <div style={{ display: "grid", gap: 20 }}>
        <div className="card" role="status">
          <h2>
            Cobros del software: {ready ? "activados" : "todavía desactivados"}
          </h2>
          <p>
            Precios vigentes: {formatMembershipPrice("month", "usd")} al mes o{" "}
            {formatMembershipPrice("year", "usd")} al año (también en € y £).
          </p>
          <p className="hint">
            {ready
              ? `Los perfiles anteriores tienen ${EXISTING_PROFESSIONAL_TRIAL_DAYS} días gratis desde que se les pasa a suscripción. Después, quien no tenga un plan vigente pierde el acceso al panel (sin perder datos) hasta pagar. Las altas nuevas activan su plan al ser aceptadas.`
              : "Mientras estén desactivados nadie pierde el acceso y los cambios de plan están bloqueados. Para activarlos: claves de Stripe (STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET) y NIDO_MEMBERSHIP_BILLING_ENABLED=true."}
          </p>
        </div>

        <div className="card">
          <h2>Pasar los perfiles anteriores a suscripción</h2>
          <p>
            {legacy.length === 1
              ? "1 perfil aprobado sigue en el plan anterior."
              : `${legacy.length} perfiles aprobados siguen en el plan anterior.`}{" "}
            Al pasarlos, cada uno recibe este correo y tiene{" "}
            {EXISTING_PROFESSIONAL_TRIAL_DAYS} días gratis con su panel
            completo. Si al terminar no activó su plan, el panel queda en pausa;
            sus pacientes, notas, agenda e historial se conservan. Siete días
            antes del final reciben un recordatorio.
          </p>
          <details>
            <summary>Ver el correo que recibirán</summary>
            <p>
              <strong>{preview.subject}</strong>
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{preview.text}</p>
          </details>
          {ready && legacy.length ? (
            <PracticeForm action={migrateAll} submit="Pasar a todos y avisar">
              <label className="practice-check">
                <input type="checkbox" name="confirm" required />
                Entiendo que{" "}
                {legacy.length === 1
                  ? "este perfil empieza"
                  : `${legacy.length} perfiles empiezan`}{" "}
                hoy {EXISTING_PROFESSIONAL_TRIAL_DAYS} días gratis, que después
                necesitarán un plan activo para usar el panel y que se enviará
                el correo ahora.
              </label>
            </PracticeForm>
          ) : (
            <p className="hint">
              {ready
                ? "No quedan perfiles en el plan anterior."
                : "Disponible cuando se activen los cobros del software."}
            </p>
          )}
        </div>

        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">
              Profesionales clínicos aprobados y su plan
            </caption>
            <thead>
              <tr>
                <th scope="col">Profesional</th>
                <th scope="col">Plan de acceso</th>
                <th scope="col">Suscripción</th>
                <th scope="col">Acción</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const paid = MEMBERSHIP_ACCESS_STATUSES.includes(
                  row.membershipStatus as (typeof MEMBERSHIP_ACCESS_STATUSES)[number],
                );
                const subscription = row.accessPlan === "subscription";
                return (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.displayName || row.name}</strong>
                      <br />
                      <span className="muted">{row.email}</span>
                    </td>
                    <td>
                      {subscription ? "Suscripción" : "Anterior (sin cobro)"}
                    </td>
                    <td>
                      {row.membershipStatus
                        ? statusLabels[row.membershipStatus] ||
                          row.membershipStatus
                        : "Sin plan"}
                      {paid && row.membershipPlan
                        ? ` · ${row.membershipPlan === "year" ? "anual" : "mensual"}`
                        : ""}
                      {subscription && !paid && row.accessTrialEndsAt ? (
                        <>
                          <br />
                          <span className="muted">
                            {trialActive(row.accessTrialEndsAt)
                              ? `Prueba gratis hasta el ${formatTrialDate(row.accessTrialEndsAt)}`
                              : `Prueba terminada el ${formatTrialDate(row.accessTrialEndsAt)}`}
                          </span>
                        </>
                      ) : null}
                    </td>
                    <td>
                      {!subscription && ready ? (
                        <PracticeForm
                          action={migrateOne}
                          submit="Pasar a suscripción"
                        >
                          <input
                            type="hidden"
                            name="professionalId"
                            value={row.id}
                          />
                        </PracticeForm>
                      ) : null}
                      {subscription && !paid && ready ? (
                        <PracticeForm
                          action={resendOne}
                          submit="Reenviar correo"
                        >
                          <input
                            type="hidden"
                            name="professionalId"
                            value={row.id}
                          />
                        </PracticeForm>
                      ) : null}
                      {subscription && !paid ? (
                        <PracticeForm
                          action={revertOne}
                          submit="Volver al plan anterior"
                        >
                          <input
                            type="hidden"
                            name="professionalId"
                            value={row.id}
                          />
                        </PracticeForm>
                      ) : null}
                      {!ready && !subscription ? (
                        <span className="muted">—</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>Todavía no hay profesionales aprobados.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
