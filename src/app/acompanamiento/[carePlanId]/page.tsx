import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  acceptCareCheckout,
  carePortal,
} from "@/app/acompanamiento/[carePlanId]/actions";
import { PracticeForm } from "@/components/practice/forms";
import { db } from "@/db";
import { careCycles, carePlans, practiceServices } from "@/db/schema";
import { patientActor } from "@/lib/practice/calls";
import { careBillingConfigured } from "@/lib/practice/care";
import { moneyLabel } from "@/lib/practice/domain";
export const metadata: Metadata = {
  title: "Tu acompañamiento",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function CarePage({
  params,
}: {
  params: Promise<{ carePlanId: string }>;
}) {
  const { carePlanId } = await params;
  const plan = await db.query.carePlans.findFirst({
    where: eq(carePlans.id, carePlanId),
  });
  if (!plan) notFound();
  const actor = await patientActor(plan.patientId, { financialAccess: true });
  if (!actor) notFound();
  const service = plan.serviceId
    ? await db.query.practiceServices.findFirst({
        where: eq(practiceServices.id, plan.serviceId),
      })
    : null;
  const cycles = await db
    .select()
    .from(careCycles)
    .where(eq(careCycles.carePlanId, plan.id));
  return (
    <section className="section">
      <div className="container orientation-chat">
        <h1>Tu acompañamiento</h1>
        <div className="card">
          <h2>{plan.title}</h2>
          <p>
            {plan.sessionsCount} sesiones de {plan.durationMinutes} minutos{" "}
            {plan.interval === "month"
              ? "por ciclo mensual"
              : "en este paquete"}
            .
          </p>
          <p>
            <strong>
              {moneyLabel(plan.priceCents, plan.currency)}{" "}
              {plan.interval === "month" ? "al mes" : "en total"}
            </strong>
          </p>
          <p>
            Las fechas se acuerdan con tu profesional. En el pago externo, cada
            ciclo dura {plan.validityDays} días desde su confirmación. Con
            tarjeta, el ciclo mensual sigue el periodo confirmado por el
            proveedor.
          </p>
          <p>
            Para cambiar o cancelar una sesión, contacta a tu profesional con{" "}
            {service?.cancellationHours ?? 24} horas de antelación. Los
            reembolsos, ausencias y sesiones ya realizadas se revisan según las
            condiciones que acuerden; cancelar la renovación no confirma un
            reembolso.
          </p>
          {plan.interval === "month" ? (
            <p>
              Si eliges tarjeta, la suscripción se renueva cada mes hasta que la
              canceles desde aquí. Por otros medios, cada pago se acuerda y
              confirma con tu profesional, sin débitos automáticos de Nido.
            </p>
          ) : null}
          {careBillingConfigured() &&
          actor.role === "seeker" &&
          plan.status === "proposed" ? (
            <PracticeForm
              action={acceptCareCheckout}
              submit="Continuar al pago seguro"
            >
              <input type="hidden" name="carePlanId" value={plan.id} />
              <label className="practice-check">
                <input type="checkbox" name="accept" required />
                Acepto el importe, las sesiones incluidas, su vigencia y{" "}
                {plan.interval === "month"
                  ? "la renovación mensual hasta cancelar"
                  : "este pago único"}
                .
              </label>
            </PracticeForm>
          ) : (
            <p>
              Acuerda con tu profesional cómo comenzar o continuar. El estado de
              las sesiones incluidas aparece cuando se confirma un ciclo.
            </p>
          )}
          {plan.stripeCustomerId && actor.role === "seeker" ? (
            <PracticeForm
              action={carePortal}
              submit="Gestionar o cancelar suscripción"
            >
              <input type="hidden" name="carePlanId" value={plan.id} />
            </PracticeForm>
          ) : null}
        </div>
        <h2>Tus ciclos confirmados</h2>
        {cycles.map((c) => (
          <article className="card" key={c.id}>
            <p>{c.sessionsCount} sesiones incluidas</p>
            <p>
              Del {c.startsAt.slice(0, 10)} al {c.endsAt.slice(0, 10)} ·{" "}
              {c.status === "paid" ? "Confirmado" : "En revisión"}
            </p>
          </article>
        ))}
        {actor.patient.conversationId ? (
          <Link href={`/c/${actor.patient.conversationId}`}>
            Volver a la conversación
          </Link>
        ) : (
          <Link href={`/pro/pacientes/${actor.patient.id}`}>
            Volver a la ficha
          </Link>
        )}
      </div>
    </section>
  );
}
