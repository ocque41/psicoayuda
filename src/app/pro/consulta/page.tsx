import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { ProfessionalPatientRequests } from "@/app/mi/professional-requests";
import { PracticeCalendar } from "@/components/practice/calendar";
import { InboxNotifier } from "@/components/practice/inbox-notifier";
import { LegacyPracticeNavigation } from "@/components/practice/legacy-navigation";
import { PracticeNav } from "@/components/practice/nav";
import { db } from "@/db";
import {
  practiceAppointments,
  practicePatients,
  practiceSettings,
} from "@/db/schema";
import { requirePracticeProfessional } from "@/lib/practice/access";
import {
  calendarMonth,
  calendarPeriod,
  calendarReferenceDay,
  calendarView,
} from "@/lib/practice/calendar";
import { dateLabel, localToUtc, moneyLabel } from "@/lib/practice/domain";
import { inboxSummary } from "@/lib/practice/queries";
import { receiptPeriod } from "@/lib/practice/receipt-export";
import { receiptTotals } from "@/lib/practice/receipt-queries";
export const metadata: Metadata = {
  title: "Tu consulta",
  robots: { index: false, follow: false },
};
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string;
    q?: string;
    mes?: string;
    dia?: string;
    vista?: string;
    pagina?: string;
    chats?: string;
    solicitudes?: string;
    solicitudes_estado?: string;
    solicitudes_desde?: string;
    solicitudes_hasta?: string;
  }>;
}) {
  const pro = await requirePracticeProfessional();
  const params = await searchParams;
  const localSettings = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  const currentMonth = new Intl.DateTimeFormat("sv-SE", {
    timeZone: localSettings?.timeZone || "America/Caracas",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  const month = calendarMonth(params.mes, currentMonth);
  const monthStart = Date.parse(`${month}-01T00:00:00Z`);
  const monthEndDate = new Date(monthStart);
  monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
  const timeZone = localSettings?.timeZone || "America/Caracas";
  const initialDay = calendarReferenceDay(month, params.dia, timeZone);
  const period = calendarPeriod(month, initialDay, calendarView(params.vista));
  const calendarRangeStart =
    localToUtc(`${period.from}T00:00`, timeZone) ||
    new Date(`${period.from}T00:00:00Z`).toISOString();
  const calendarRangeEnd =
    localToUtc(`${period.until}T00:00`, timeZone) ||
    new Date(`${period.until}T00:00:00Z`).toISOString();
  const nextMonth = monthEndDate.toISOString().slice(0, 7);
  const rangeStart =
    localToUtc(`${month}-01T00:00`, timeZone) ||
    new Date(monthStart - 86400000).toISOString();
  const rangeEnd =
    localToUtc(`${nextMonth}-01T00:00`, timeZone) || monthEndDate.toISOString();
  const currentPeriod = receiptPeriod(currentMonth, timeZone);
  const [appointments, totals, inbox, active, upcoming] = await Promise.all([
    db
      .select({
        id: practiceAppointments.id,
        patientId: practiceAppointments.patientId,
        name: practicePatients.name,
        startsAt: practiceAppointments.startsAt,
        endsAt: practiceAppointments.endsAt,
        status: practiceAppointments.status,
        modality: practiceAppointments.modality,
      })
      .from(practiceAppointments)
      .innerJoin(
        practicePatients,
        and(
          eq(practicePatients.id, practiceAppointments.patientId),
          eq(practicePatients.professionalId, pro.id),
        ),
      )
      .where(
        and(
          eq(practiceAppointments.professionalId, pro.id),
          gte(practiceAppointments.startsAt, calendarRangeStart),
          lt(practiceAppointments.startsAt, calendarRangeEnd),
        ),
      )
      .orderBy(asc(practiceAppointments.startsAt))
      .limit(201),
    receiptTotals(pro.id, {
      startsAt: currentPeriod.startsAt,
      endsAt: currentPeriod.endsAt,
    }).then((rows) =>
      rows.map((row) => ({
        amount: row.amountCents,
        currency: row.currency,
      })),
    ),
    inboxSummary(pro.id),
    db
      .select({ count: sql<number>`count(*)` })
      .from(practicePatients)
      .where(
        and(
          eq(practicePatients.professionalId, pro.id),
          eq(practicePatients.status, "active"),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(practiceAppointments)
      .where(
        and(
          eq(practiceAppointments.professionalId, pro.id),
          eq(practiceAppointments.status, "scheduled"),
          gte(
            practiceAppointments.startsAt,
            new Date(
              Math.max(Date.now(), Date.parse(rangeStart)),
            ).toISOString(),
          ),
          lt(practiceAppointments.startsAt, rangeEnd),
        ),
      ),
  ]);
  return (
    <section className="section">
      <div className="container practice-shell">
        <p className="eyebrow">Nido para profesionales</p>
        <h1>Tu consulta, en orden</h1>
        <p className="lead">
          Hola, {pro.displayName || pro.fullName.split(" ")[0]}. Este es tu
          espacio para acompañar y organizar el próximo paso.
        </p>
        <PracticeNav />
        <LegacyPracticeNavigation />
        <PracticeCalendar
          month={month}
          initialDay={initialDay}
          timeZone={timeZone}
          events={appointments.slice(0, 200).map((a) => ({
            id: a.id,
            startsAt: a.startsAt,
            endsAt: a.endsAt,
            dateText: dateLabel(a.startsAt, timeZone),
            patientId: a.patientId,
            name: a.name,
            status: a.status,
          }))}
        />
        {appointments.length > 200 ? (
          <p role="status">
            El calendario muestra las primeras 200 sesiones del periodo visible.
            Consulta las fichas para el detalle completo.
          </p>
        ) : null}
        <InboxNotifier initial={inbox} />
        <div className="practice-metrics">
          <article className="card">
            <span>En acompañamiento</span>
            <strong>{Number(active[0]?.count || 0)}</strong>
          </article>
          <article className="card">
            <span>Próximas sesiones del mes</span>
            <strong>{Number(upcoming[0]?.count || 0)}</strong>
          </article>
          <article className="card">
            <span>Mensajes por leer</span>
            <strong>{inbox.unread}</strong>
          </article>
          <article className="card">
            <span>Cobros externos del mes</span>
            <strong className="practice-money">
              {totals.length
                ? totals.map(({ currency: c, amount }) => (
                    <span key={c}>{moneyLabel(amount, c)}</span>
                  ))
                : "Sin registros"}
            </strong>
            <small>Confirmados por ti · por moneda</small>
          </article>
        </div>
        <ProfessionalPatientRequests
          professionalId={pro.id}
          timezone={timeZone}
          parameters={params}
          month={month}
        />
      </div>
    </section>
  );
}
