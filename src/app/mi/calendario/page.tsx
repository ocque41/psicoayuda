import Link from "next/link";
import {
  CalendarPagination,
  PracticeCalendar,
} from "@/components/practice/calendar";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import {
  patientAppointments,
  patientRequestCounts,
  patientRequests,
} from "@/lib/patient/queries";
import { calendarMonth } from "@/lib/practice/calendar";
import { dateLabel, localToUtc } from "@/lib/practice/domain";
import { pageNumber } from "@/lib/practice/queries";
import { AppointmentList, RequestList } from "../patient-parts";

function localMonth(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}`;
}
export default async function PatientCalendar({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    dia?: string;
    vista?: string;
    pagina?: string;
    solicitudes?: string;
  }>;
}) {
  const { account } = await requirePatientAccount(),
    params = await searchParams;
  const month = calendarMonth(params.mes, localMonth(account.timezone));
  const nextStart = new Date(`${month}-01T00:00:00Z`);
  nextStart.setUTCMonth(nextStart.getUTCMonth() + 1);
  const next = nextStart.toISOString().slice(0, 7);
  const from =
      localToUtc(`${month}-01T00:00`, account.timezone) ||
      `${month}-01T00:00:00.000Z`,
    until =
      localToUtc(`${next}-01T00:00`, account.timezone) ||
      nextStart.toISOString();
  const requestCounts = await patientRequestCounts(account.userId),
    requestPages = Math.max(1, Math.ceil(requestCounts.total / 20)),
    requestPage = Math.min(pageNumber(params.solicitudes), requestPages);
  const [appointments, requests, calendar] = await Promise.all([
    patientAppointments(account.userId, { page: params.pagina, from, until }),
    patientRequests(account.userId, requestPage),
    patientAppointments(account.userId, { from, until, calendar: true }),
  ]);
  return (
    <WorkspaceShell
      audience="patient"
      title="Tu tiempo, con espacio"
      description={`Sesiones y solicitudes en tu zona horaria: ${account.timezone.replaceAll("_", " ")}.`}
      actions={
        <Link href="/mi/nueva-sesion" className="button human">
          Solicitar sesión ↗
        </Link>
      }
    >
      <PracticeCalendar
        audience="patient"
        month={month}
        timeZone={account.timezone}
        events={calendar.rows.slice(0, 200).map((a) => ({
          id: a.id,
          startsAt: a.startsAt,
          dateText: dateLabel(a.startsAt, account.timezone),
          name: a.name,
          status: a.status,
          href:
            a.conversationStatus === "open" &&
            !a.conversationClosedAt &&
            a.professionalStatus === "approved" &&
            !a.nonClinicalHelper
              ? `/sesion/${a.id}`
              : `/mi/mensajes/${a.conversationId}`,
        }))}
      />
      <section className="workspace-card">
        {calendar.total > 200 ? (
          <p className="hint">
            El calendario muestra las primeras 200 sesiones. El listado paginado
            contiene todas las sesiones del mes.
          </p>
        ) : null}
        <h2>Sesiones de este mes</h2>
        <AppointmentList
          rows={appointments.rows}
          timezone={account.timezone}
          controls
        />
        <CalendarPagination
          page={appointments.page}
          pages={appointments.pages}
          total={appointments.total}
          month={month}
          pageKey="pagina"
        />
      </section>
      {requests.length ? (
        <section className="workspace-card">
          <h2>Solicitudes recientes</h2>
          <RequestList rows={requests} timezone={account.timezone} />
          <CalendarPagination
            page={requestPage}
            pages={requestPages}
            total={requestCounts.total}
            month={month}
            pageKey="solicitudes"
          />
        </section>
      ) : null}
    </WorkspaceShell>
  );
}
