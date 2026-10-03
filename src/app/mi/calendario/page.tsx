import Link from "next/link";
import { PracticeCalendar } from "@/components/practice/calendar";
import { PracticePagination } from "@/components/practice/pagination";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import {
  patientAppointments,
  patientRequestCounts,
  patientRequests,
} from "@/lib/patient/queries";
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
    pagina?: string;
    solicitudes?: string;
  }>;
}) {
  const { account } = await requirePatientAccount(),
    params = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes || "")
    ? (params.mes as string)
    : localMonth(account.timezone);
  const next = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1),
  )
    .toISOString()
    .slice(0, 7);
  const from =
      localToUtc(`${month}-01T00:00`, account.timezone) ||
      `${month}-01T00:00:00.000Z`,
    until =
      localToUtc(`${next}-01T00:00`, account.timezone) ||
      `${next}-01T00:00:00.000Z`;
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
          href: `/sesion/${a.id}`,
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
        <PracticePagination
          {...appointments}
          href={(page) => `/mi/calendario?mes=${month}&pagina=${page}`}
        />
      </section>
      {requests.length ? (
        <section className="workspace-card">
          <h2>Solicitudes recientes</h2>
          <RequestList rows={requests} timezone={account.timezone} />
          <PracticePagination
            page={requestPage}
            pages={requestPages}
            total={requestCounts.total}
            href={(page) => `/mi/calendario?mes=${month}&solicitudes=${page}`}
          />
        </section>
      ) : null}
    </WorkspaceShell>
  );
}
