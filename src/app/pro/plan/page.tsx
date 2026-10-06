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
import { MEMBERSHIP_PLAN } from "@/lib/practice/membership-plan";
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
  const subscriptionCurrent = Boolean(
    member?.stripeSubscriptionId &&
      !["canceled", "incomplete_expired"].includes(member.status),
  );
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
              <strong>{MEMBERSHIP_PLAN.priceLabel} al mes</strong>. Una única
              suscripción mensual para nuevas contrataciones.
            </p>
            <p>
              Agenda, fichas de pacientes, servicios y seguimiento de cobros. El
              uso de llamadas, grabaciones y transcripción tendrá condiciones e
              integración propias.
            </p>
            {member?.stripeSubscriptionId ? (
              <p className="hint">
                Tu suscripción existente conserva las condiciones que
                contrataste. Consulta sus importes y renovación en el portal de
                facturación; este precio no cambia los cobros anteriores.
              </p>
            ) : null}
            {ready &&
            member &&
            !subscriptionCurrent &&
            pro.status === "approved" ? (
              <PracticeForm
                action={subscribeSoftware}
                submit="Continuar al pago seguro"
              >
                <input
                  type="hidden"
                  name="plan"
                  value={MEMBERSHIP_PLAN.interval}
                />
                <input
                  type="hidden"
                  name="pricePolicy"
                  value={MEMBERSHIP_PLAN.policyVersion}
                />
                <label className="practice-check">
                  <input type="checkbox" name="accept" required />
                  Acepto {MEMBERSHIP_PLAN.priceLabel} cada mes, con renovación
                  mensual hasta que cancele desde el portal. Si mi prueba sigue
                  activa, el primer cobro se realiza al finalizarla.
                </label>
              </PracticeForm>
            ) : (
              <p className="hint">
                {!ready
                  ? "Los cobros del software aún no están abiertos. Puedes usar la consulta durante la beta."
                  : subscriptionCurrent
                    ? "Gestiona tu suscripción existente desde el portal de facturación."
                    : pro.status !== "approved"
                      ? "Tu perfil necesita aprobación antes de contratar el software."
                      : "Activa primero tu prueba gratuita para elegir un plan."}
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
