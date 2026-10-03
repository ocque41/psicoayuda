import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import {
  activateTrial,
  billingPortal,
  subscribeSoftware,
} from "@/app/pro/plan/actions";
import { PracticeForm } from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { db } from "@/db";
import { professionalMemberships } from "@/db/schema";
import { requirePracticeBillingProfessional } from "@/lib/practice/access";
import { membershipBillingReady, TRIAL_DAYS } from "@/lib/practice/billing";
export const metadata: Metadata = {
  title: "Tu plan de Nido",
  robots: { index: false, follow: false },
};
const statusLabels: Record<string, string> = {
  trialing: "En prueba",
  active: "Activo",
  past_due: "Pago pendiente",
  canceled: "Cancelado",
  incomplete: "Pendiente de confirmación",
  incomplete_expired: "Sin confirmar",
  unpaid: "Sin pagar",
  paused: "En pausa",
};
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ resultado?: string }>;
}) {
  const pro = await requirePracticeBillingProfessional();
  const query = await searchParams;
  const member = await db.query.professionalMemberships.findFirst({
    where: eq(professionalMemberships.professionalId, pro.id),
  });
  const ready = membershipBillingReady();
  const trialExpired = member && Date.parse(member.trialEndsAt) <= Date.now();
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Más tiempo para acompañar</h1>
        <PracticeNav />
        <p className="lead">
          La suscripción paga el software que usas para organizar tu consulta.
          Las sesiones con tus pacientes se acuerdan por separado.
        </p>
        <div className="grid grid-2">
          <article className="card">
            <h2>Empieza con {TRIAL_DAYS} días</h2>
            <p>
              Prueba gratuita sin tarjeta. No se convierte en un cobro
              automáticamente.
            </p>
            {member ? (
              <>
                <p>
                  Estado:{" "}
                  {member.status === "trialing" && trialExpired
                    ? "Prueba finalizada"
                    : statusLabels[member.status] || "En revisión"}
                </p>
                <p>
                  Tu prueba termina el{" "}
                  {new Intl.DateTimeFormat("es", {
                    timeZone: "America/Caracas",
                    dateStyle: "long",
                  }).format(new Date(member.trialEndsAt))}
                  .
                </p>
                <p className="hint">
                  Durante la beta, la prueba no bloquea el acceso al CRM ni a
                  tus chats.
                </p>
              </>
            ) : pro.status === "approved" ? (
              <PracticeForm
                action={activateTrial}
                submit="Activar mi prueba gratuita"
              >
                <label className="practice-check">
                  <input name="accept" type="checkbox" required />
                  Entiendo que esta prueba es del software profesional y que no
                  inicia cobros.
                </label>
              </PracticeForm>
            ) : (
              <p className="hint">
                Tu perfil necesita revisión antes de activar un plan nuevo.
                Puedes gestionar una suscripción existente aquí.
              </p>
            )}
          </article>
          <article className="card">
            <h2>Un solo plan profesional</h2>
            <p>
              <strong>19 USD al mes</strong> o <strong>99 USD al año</strong>.
            </p>
            <p>
              Agenda, fichas de pacientes, servicios y seguimiento de cobros. El
              uso de llamadas, grabaciones y transcripción tendrá condiciones e
              integración propias.
            </p>
            {ready && member && pro.status === "approved" ? (
              <PracticeForm
                action={subscribeSoftware}
                submit="Continuar al pago seguro"
              >
                <label>
                  Frecuencia
                  <select name="plan">
                    <option value="month">19 USD cada mes</option>
                    <option value="year">99 USD cada año</option>
                  </select>
                </label>
                <label className="practice-check">
                  <input type="checkbox" name="accept" required />
                  Acepto el precio elegido y su renovación hasta que cancele
                  desde el portal.
                </label>
              </PracticeForm>
            ) : (
              <p className="hint">
                Los cobros del software aún no están abiertos. Puedes usar la
                consulta durante la beta.
              </p>
            )}
            {member?.stripeCustomerId ? (
              <PracticeForm
                action={billingPortal}
                submit="Gestionar o cancelar suscripción"
              />
            ) : null}
          </article>
        </div>
        {query.resultado ? (
          <p role="status">
            Estamos confirmando tu suscripción con el proveedor. El estado se
            actualiza tras recibir su confirmación.
          </p>
        ) : null}
      </div>
    </section>
  );
}
