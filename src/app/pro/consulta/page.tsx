import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ProfessionalPatientRequests } from "@/app/mi/professional-requests";
import {
  createPatient,
  releaseConversationQuota,
} from "@/app/pro/consulta/actions";
import {
  CalendarPagination,
  PracticeCalendar,
} from "@/components/practice/calendar";
import { PracticeForm, TimeZoneSelect } from "@/components/practice/forms";
import { InboxNotifier } from "@/components/practice/inbox-notifier";
import { PracticeNav } from "@/components/practice/nav";
import { db } from "@/db";
import {
  practiceAppointments,
  practicePatients,
  practiceSettings,
} from "@/db/schema";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { calendarMonth } from "@/lib/practice/calendar";
import {
  appointmentStateLabels,
  dateLabel,
  localToUtc,
  moneyLabel,
  patientStateLabels,
} from "@/lib/practice/domain";
import { chatList, inboxSummary, patientList } from "@/lib/practice/queries";
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
  const nextMonth = monthEndDate.toISOString().slice(0, 7);
  const rangeStart =
    localToUtc(`${month}-01T00:00`, timeZone) ||
    new Date(monthStart - 86400000).toISOString();
  const rangeEnd =
    localToUtc(`${nextMonth}-01T00:00`, timeZone) || monthEndDate.toISOString();
  const currentPeriod = receiptPeriod(currentMonth, timeZone);
  const [patients, appointments, totals, chats, inbox, active, upcoming] =
    await Promise.all([
      patientList(pro.id, params),
      db
        .select({
          id: practiceAppointments.id,
          patientId: practiceAppointments.patientId,
          name: practicePatients.name,
          startsAt: practiceAppointments.startsAt,
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
            gte(practiceAppointments.startsAt, rangeStart),
            lt(practiceAppointments.startsAt, rangeEnd),
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
      chatList(pro.id, params.chats),
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
        <p>
          <Link href="/demo/consulta">
            Conocer mi consulta con el pajarito →
          </Link>
        </p>
        <PracticeNav />
        <PracticeCalendar
          month={month}
          timeZone={timeZone}
          events={appointments.slice(0, 200).map((a) => ({
            id: a.id,
            startsAt: a.startsAt,
            dateText: dateLabel(a.startsAt, timeZone),
            patientId: a.patientId,
            name: a.name,
            status: a.status,
          }))}
        />
        {appointments.length > 200 ? (
          <p role="status">
            El calendario muestra las primeras 200 sesiones de este mes.
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
        <div className="practice-columns">
          <section>
            <h2>Agenda</h2>
            <p className="hint">
              Horario de tu consulta: {timeZone}.{" "}
              <Link href="/pro/ajustes">Cambiar</Link>
            </p>
            <div className="practice-agenda">
              {appointments.length ? (
                appointments.map((a) => (
                  <article className="card practice-appointment" key={a.id}>
                    <time dateTime={a.startsAt}>
                      {dateLabel(a.startsAt, timeZone)}
                    </time>
                    <h3>
                      <Link href={`/pro/pacientes/${a.patientId}`}>
                        {a.name}
                      </Link>
                    </h3>
                    <p>
                      {appointmentStateLabels[a.status]} ·{" "}
                      {a.modality === "online" ? "En línea" : "Presencial"}
                    </p>
                  </article>
                ))
              ) : (
                <div className="card">
                  <h3>Deja espacio para tu próxima sesión</h3>
                  <p>
                    Crea una ficha, configura tus servicios y programa una cita
                    desde el paciente.
                  </p>
                  <Link href="/pro/servicios">Configurar mis servicios →</Link>
                </div>
              )}
            </div>
          </section>
          <section id="pacientes">
            <h2>Pacientes</h2>
            <form
              method="get"
              className="practice-filter"
              action="/pro/consulta#pacientes"
            >
              <input type="hidden" name="mes" value={month} />
              <label>
                Buscar por nombre
                <input name="q" defaultValue={params.q} maxLength={80} />
              </label>
              <label>
                Seguimiento
                <select name="estado" defaultValue={params.estado || ""}>
                  <option value="">Todos</option>
                  {Object.entries(patientStateLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="button secondary">
                Filtrar
              </button>
            </form>
            <div className="practice-patients">
              {patients.rows.map((p) => (
                <Link
                  className="card practice-patient-row"
                  href={`/pro/pacientes/${p.id}`}
                  key={p.id}
                >
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.program === "earthquake"
                        ? "Ayuda Terremoto · $0"
                        : "Consulta"}
                    </small>
                  </span>
                  <span className="panel-chip">
                    {patientStateLabels[p.status]}
                  </span>
                </Link>
              ))}
              {!patients.rows.length ? (
                <p className="hint">No hay fichas con estos filtros.</p>
              ) : null}
            </div>
            <CalendarPagination
              page={patients.page}
              pages={patients.pages}
              total={patients.total}
              month={month}
              pageKey="pagina"
              anchor="pacientes"
            />
            <details className="card">
              <summary>Crear ficha de paciente</summary>
              <PracticeForm
                action={createPatient}
                submit="Crear ficha"
                resetOnSuccess
              >
                <label>
                  Nombre o alias
                  <input
                    name="name"
                    required
                    maxLength={80}
                    autoComplete="off"
                  />
                </label>
                <label>
                  Correo de contacto (opcional)
                  <input type="email" name="email" maxLength={254} />
                </label>
                <label>
                  País donde recibe atención
                  <input
                    name="country"
                    defaultValue="Venezuela"
                    required
                    maxLength={80}
                  />
                </label>
                <TimeZoneSelect />
                <label>
                  Programa
                  <select name="program">
                    <option value="general">Consulta</option>
                    <option value="earthquake">
                      Ayuda Terremoto · elegibilidad confirmada · $0
                    </option>
                  </select>
                </label>
                <label className="practice-check">
                  <input type="checkbox" name="consent" required />
                  Tengo autorización para guardar estos datos de contacto.
                </label>
              </PracticeForm>
            </details>
          </section>
        </div>
        <section id="chats">
          <h2>Chats y cupos</h2>
          <p>
            Un contacto sin respuesta no tiene que bloquear tu capacidad. Puedes
            liberar su cupo conservando la conversación.
          </p>
          <div className="grid grid-2">
            {chats.rows.map((c) => (
              <article className="card" key={c.id}>
                <h3>{c.name || "Persona sin alias"}</h3>
                <Link className="button secondary" href={`/c/${c.id}`}>
                  Abrir chat
                </Link>
                {c.patientId ? (
                  <p>
                    <Link href={`/pro/pacientes/${c.patientId}`}>
                      Abrir su ficha de paciente →
                    </Link>
                  </p>
                ) : (
                  <details>
                    <summary>Vincular a una ficha</summary>
                    <PracticeForm
                      action={createPatient}
                      submit="Crear ficha vinculada"
                      resetOnSuccess
                    >
                      <input type="hidden" name="conversationId" value={c.id} />
                      <input
                        type="hidden"
                        name="program"
                        value={c.helpRequestId ? "earthquake" : "general"}
                      />
                      <label>
                        Nombre o alias
                        <input
                          name="name"
                          defaultValue={c.name || ""}
                          required
                          maxLength={80}
                        />
                      </label>
                      <label>
                        Correo
                        <input
                          name="email"
                          type="email"
                          defaultValue={c.email || ""}
                        />
                      </label>
                      <label>
                        País donde recibe atención
                        <input
                          name="country"
                          defaultValue="Venezuela"
                          required
                        />
                      </label>
                      <TimeZoneSelect />
                      <label className="practice-check">
                        <input type="checkbox" name="consent" required />
                        Tengo autorización para crear la ficha.
                      </label>
                    </PracticeForm>
                  </details>
                )}
                {c.quotaReleasedAt ? (
                  <p className="hint">Este chat ya no ocupa cupo.</p>
                ) : (
                  <PracticeForm
                    action={releaseConversationQuota}
                    submit="Liberar cupo sin borrar chat"
                  >
                    <input type="hidden" name="conversationId" value={c.id} />
                  </PracticeForm>
                )}
              </article>
            ))}
          </div>
          {!chats.rows.length ? (
            <p className="hint">
              Tus conversaciones aparecerán aquí cuando una persona contacte
              contigo.
            </p>
          ) : null}
          <CalendarPagination
            page={chats.page}
            pages={chats.pages}
            total={chats.total}
            month={month}
            pageKey="chats"
            anchor="chats"
          />
        </section>
      </div>
    </section>
  );
}
