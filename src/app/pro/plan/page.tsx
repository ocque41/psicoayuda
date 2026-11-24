import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { billingPortal, subscribeSoftware } from "@/app/pro/plan/actions";
import { PracticeForm } from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { PlanPicker } from "@/components/practice/plan-picker";
import { db } from "@/db";
import { professionalMemberships, professionals } from "@/db/schema";
import { requirePracticeBillingProfessional } from "@/lib/practice/access";
import { membershipBillingReady } from "@/lib/practice/billing";
import {
  formatMembershipPrice,
  formatTrialDate,
  isMembershipCurrency,
  isMembershipInterval,
  MEMBERSHIP_ACCESS_STATUSES,
  stripeTrialEnd,
  suggestedMembershipCurrency,
  trialActive,
  trialDaysLeft,
} from "@/lib/practice/membership-plan";
import { accessLockedFor } from "@/lib/practice/subscription-access";

export const metadata: Metadata = {
  title: "Tu plan de Nido",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  none: "Sin plan activo",
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
  const [member, profile] = await Promise.all([
    db.query.professionalMemberships.findFirst({
      where: eq(professionalMemberships.professionalId, pro.id),
    }),
    db.query.professionals.findFirst({
      where: eq(professionals.id, pro.id),
      columns: {
        country: true,
        accessPlan: true,
        accessTrialEndsAt: true,
        nonClinicalHelper: true,
      },
    }),
  ]);
  const ready = membershipBillingReady();
  const approved = pro.status === "approved";
  const trialEndsAt = profile?.accessTrialEndsAt ?? null;
  const locked = accessLockedFor(
    profile?.accessPlan,
    member?.status,
    trialEndsAt,
  );
  const subscriptionCurrent = Boolean(
    member?.stripeSubscriptionId &&
      MEMBERSHIP_ACCESS_STATUSES.includes(
        member.status as (typeof MEMBERSHIP_ACCESS_STATUSES)[number],
      ),
  );
  const canPay = ready && approved && !subscriptionCurrent;
  const legacy = profile?.accessPlan !== "subscription";
  const onTrial =
    !legacy && !subscriptionCurrent && trialEndsAt && trialActive(trialEndsAt);
  const trialEnded =
    !legacy && !subscriptionCurrent && trialEndsAt && !trialActive(trialEndsAt);
  // Alta recién aceptada: nunca tuvo prueba ni suscripción. No está "en
  // pausa": es el último paso de su solicitud.
  const firstActivation =
    locked && !trialEndsAt && !member?.stripeSubscriptionId;
  // Fecha del primer cobro si se activa ahora durante la prueba.
  const chargeFrom =
    !legacy && trialEndsAt && stripeTrialEnd(trialEndsAt)
      ? formatTrialDate(trialEndsAt)
      : null;
  return (
    <section className="section">
      <div className="container practice-shell">
        <p className="eyebrow">Nido · Tu plan</p>
        <h1>
          {subscriptionCurrent
            ? "Tu plan está activo"
            : canPay || locked
              ? "Activa tu plan"
              : onTrial
                ? "Tu prueba gratuita de Nido"
                : "Tu plan de Nido"}
        </h1>
        {locked ? null : <PracticeNav />}
        {query.resultado ? (
          <p className="status-message" role="status">
            Estamos confirmando tu suscripción con el proveedor de pagos. En
            cuanto llegue la confirmación (suele tardar unos segundos), podrás
            entrar a tu panel.
          </p>
        ) : null}
        {onTrial && trialEndsAt ? (
          <div className="card" role="status">
            <h2>
              Prueba gratuita: te quedan {trialDaysLeft(trialEndsAt)} días
            </h2>
            <p>
              Tu panel funciona con normalidad hasta el{" "}
              {formatTrialDate(trialEndsAt)}. Si activas tu plan ahora, no se
              cobra nada hasta esa fecha y puedes cancelar antes sin coste.
            </p>
          </div>
        ) : null}
        {firstActivation ? (
          <div className="card" role="status">
            <h2>Tu solicitud fue aceptada: último paso</h2>
            <p>
              Activa tu plan para entrar a tu panel
              {profile?.nonClinicalHelper
                ? " y empezar a recibir solicitudes de apoyo"
                : " y organizar tu consulta"}
              . En cuanto se confirme el pago, entras directamente.
            </p>
          </div>
        ) : locked ? (
          <div className="card" role="status">
            <h2>
              {trialEnded
                ? "Tu prueba gratuita terminó"
                : "Tu panel está en pausa"}
            </h2>
            <p>
              Para seguir usando Nido, activa tu plan. Tus pacientes, notas,
              agenda e historial están guardados y vuelven intactos en cuanto se
              confirme el pago.
            </p>
            <p className="hint">
              Las conversaciones abiertas siguen disponibles desde los enlaces
              de tus avisos por correo.
            </p>
          </div>
        ) : (
          <p className="lead">
            {profile?.nonClinicalHelper
              ? "La suscripción incluye tu panel de Nido: las solicitudes de apoyo que te asignamos, los mensajes y tu perfil visible para quien busca acompañamiento."
              : "La suscripción incluye el software para organizar tu consulta: agenda, fichas de pacientes, servicios, mensajes y seguimiento de cobros. Las sesiones con tus pacientes se acuerdan por separado."}
          </p>
        )}

        {subscriptionCurrent && member ? (
          <article className="card">
            <h2>{statusLabels[member.status] || "En revisión"}</h2>
            <p>
              Plan{" "}
              {member.plan === "year"
                ? "anual"
                : member.plan === "month"
                  ? "mensual"
                  : "contratado"}
              {isMembershipInterval(member.plan) &&
              isMembershipCurrency(member.currency)
                ? ` · ${formatMembershipPrice(member.plan, member.currency)}`
                : ""}
              .
            </p>
            {member.status === "past_due" ? (
              <p className="hint">
                No pudimos cobrar la última renovación. Actualiza tu método de
                pago desde el portal para no perder el acceso.
              </p>
            ) : null}
            <p>
              <Link className="button human" href="/pro/dashboard">
                Ir a mi panel →
              </Link>
            </p>
          </article>
        ) : (
          <article className="card">
            <h2>Elige cómo quieres pagar</h2>
            {canPay ? (
              <PracticeForm
                action={subscribeSoftware}
                submit="Continuar al pago seguro"
              >
                <PlanPicker
                  defaultCurrency={suggestedMembershipCurrency(
                    profile?.country,
                  )}
                  canPay
                  chargeFrom={chargeFrom}
                />
              </PracticeForm>
            ) : (
              <>
                <PlanPicker
                  defaultCurrency={suggestedMembershipCurrency(
                    profile?.country,
                  )}
                  canPay={false}
                />
                <p className="hint">
                  {!approved
                    ? "Podrás activar tu plan en cuanto el equipo apruebe tu perfil. Te avisaremos por correo."
                    : "La activación de planes abre muy pronto y te avisaremos por correo. Mientras tanto, tu panel sigue disponible sin cambios."}
                </p>
                {approved && !locked ? (
                  <p>
                    <Link className="button human" href="/pro/dashboard">
                      Ir a mi panel →
                    </Link>
                  </p>
                ) : null}
              </>
            )}
            {legacy && approved && !subscriptionCurrent ? (
              <p className="hint">
                Tu perfil conserva su acceso actual. Te escribiremos antes de
                cualquier cambio.
              </p>
            ) : null}
          </article>
        )}
        {member?.stripeCustomerId ? (
          <PracticeForm
            action={billingPortal}
            submit="Gestionar o cancelar suscripción"
          />
        ) : null}
      </div>
    </section>
  );
}
