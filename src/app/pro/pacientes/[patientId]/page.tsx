import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  isNull,
  sql,
} from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  linkPatientConversation,
  rescheduleAppointment,
  saveReceipt,
  scheduleAppointment,
  setPatientStatus,
  updateAppointment,
  updatePatientContact,
} from "@/app/pro/consulta/actions";
import {
  confirmExternalCycle,
  proposeCare,
} from "@/app/pro/pacientes/[patientId]/care-actions";
import {
  CurrencySelect,
  PracticeForm,
  TimeZoneSelect,
} from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { PracticePagination } from "@/components/practice/pagination";
import { PatientNotes } from "@/components/practice/patient-notes";
import { db } from "@/db";
import {
  careCycles,
  carePlans,
  conversations,
  practiceAppointments,
  practicePatients,
  practiceReceipts,
  practiceServices,
  practiceSettings,
} from "@/db/schema";
import {
  ownedPatient,
  requirePracticeProfessional,
} from "@/lib/practice/access";
import {
  appointmentStateLabels,
  dateLabel,
  moneyLabel,
  patientStateLabels,
  paymentMethodLabels,
} from "@/lib/practice/domain";
import { PRACTICE_PAGE_SIZE, pageNumber } from "@/lib/practice/queries";
import { receiptRecordedAt } from "@/lib/practice/receipt-history";
import { receiptDateLabel, receiptLocalInput } from "@/lib/practice/receipts";
export const metadata: Metadata = {
  title: "Ficha de paciente",
  robots: { index: false, follow: false },
};
export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{
    sesiones?: string;
    cobros?: string;
    acuerdos?: string;
    notas?: string;
  }>;
}) {
  const pro = await requirePracticeProfessional();
  const { patientId } = await params;
  const patient = await ownedPatient(patientId, pro.id);
  if (!patient) notFound();
  const query = await searchParams;
  const [counts] = await db
    .select({
      sessions: sql<number>`(SELECT count(*) FROM practice_appointments WHERE patient_id = ${patient.id} AND professional_id = ${pro.id})`,
      receipts: sql<number>`(SELECT count(*) FROM practice_receipts WHERE patient_id = ${patient.id} AND professional_id = ${pro.id})`,
      plans: sql<number>`(SELECT count(*) FROM care_plans WHERE patient_id = ${patient.id} AND professional_id = ${pro.id})`,
    })
    .from(practicePatients)
    .where(eq(practicePatients.id, patient.id));
  const pages = {
    sesiones: Math.max(
      1,
      Math.ceil(Number(counts?.sessions || 0) / PRACTICE_PAGE_SIZE),
    ),
    cobros: Math.max(
      1,
      Math.ceil(Number(counts?.receipts || 0) / PRACTICE_PAGE_SIZE),
    ),
    acuerdos: Math.max(
      1,
      Math.ceil(Number(counts?.plans || 0) / PRACTICE_PAGE_SIZE),
    ),
  };
  const page = {
    sesiones: Math.min(pageNumber(query.sesiones), pages.sesiones),
    cobros: Math.min(pageNumber(query.cobros), pages.cobros),
    acuerdos: Math.min(pageNumber(query.acuerdos), pages.acuerdos),
  };
  const [
    appointments,
    receipts,
    services,
    settings,
    plans,
    cycles,
    availableChats,
  ] = await Promise.all([
    db
      .select()
      .from(practiceAppointments)
      .where(
        and(
          eq(practiceAppointments.patientId, patient.id),
          eq(practiceAppointments.professionalId, pro.id),
        ),
      )
      .orderBy(
        desc(practiceAppointments.startsAt),
        desc(practiceAppointments.id),
      )
      .limit(PRACTICE_PAGE_SIZE)
      .offset((page.sesiones - 1) * PRACTICE_PAGE_SIZE),
    db
      .select({
        ...getTableColumns(practiceReceipts),
        recordedAt: receiptRecordedAt,
      })
      .from(practiceReceipts)
      .where(
        and(
          eq(practiceReceipts.patientId, patient.id),
          eq(practiceReceipts.professionalId, pro.id),
        ),
      )
      .orderBy(desc(practiceReceipts.receivedAt), desc(practiceReceipts.id))
      .limit(PRACTICE_PAGE_SIZE)
      .offset((page.cobros - 1) * PRACTICE_PAGE_SIZE),
    db
      .select()
      .from(practiceServices)
      .where(
        and(
          eq(practiceServices.professionalId, pro.id),
          eq(practiceServices.active, true),
        ),
      )
      .orderBy(asc(practiceServices.title)),
    db.query.practiceSettings.findFirst({
      where: eq(practiceSettings.professionalId, pro.id),
    }),
    db
      .select()
      .from(carePlans)
      .where(
        and(
          eq(carePlans.patientId, patient.id),
          eq(carePlans.professionalId, pro.id),
        ),
      )
      .orderBy(desc(carePlans.createdAt), desc(carePlans.id))
      .limit(PRACTICE_PAGE_SIZE)
      .offset((page.acuerdos - 1) * PRACTICE_PAGE_SIZE),
    db
      .select({
        id: careCycles.id,
        startsAt: careCycles.startsAt,
        endsAt: careCycles.endsAt,
        count: careCycles.sessionsCount,
        title: carePlans.title,
        used: sql<number>`(SELECT count(*) FROM practice_appointments a WHERE a.care_cycle_id = ${careCycles.id} AND a.status != 'cancelled')`,
      })
      .from(careCycles)
      .innerJoin(carePlans, eq(careCycles.carePlanId, carePlans.id))
      .where(
        and(
          eq(carePlans.patientId, patient.id),
          eq(carePlans.professionalId, pro.id),
          eq(careCycles.status, "paid"),
          gt(careCycles.endsAt, new Date().toISOString()),
        ),
      ),
    patient.conversationId
      ? Promise.resolve([])
      : db
          .select({ id: conversations.id, name: conversations.seekerName })
          .from(conversations)
          .leftJoin(
            practicePatients,
            eq(practicePatients.conversationId, conversations.id),
          )
          .where(
            and(
              eq(conversations.professionalId, pro.id),
              eq(conversations.status, "open"),
              isNull(conversations.deletedAt),
              isNull(conversations.anonymizedAt),
              isNull(practicePatients.id),
              patient.program === "earthquake"
                ? sql`${conversations.helpRequestId} IS NOT NULL`
                : isNull(conversations.helpRequestId),
            ),
          )
          .orderBy(desc(conversations.updatedAt))
          .limit(100),
  ]);
  function historyHref(key: keyof typeof page, number: number) {
    const params = new URLSearchParams(
      Object.entries({ ...page, [key]: number }).map(([k, v]) => [
        k,
        String(v),
      ]),
    );
    return `/pro/pacientes/${patientId}?${params}#${key === "acuerdos" ? "acuerdos" : key}`;
  }
  const zone = settings?.timeZone || "America/Caracas";
  return (
    <section className="section">
      <div className="container practice-shell">
        <Link href="/pro/consulta">← Todos los pacientes</Link>
        <h1>{patient.name}</h1>
        <p>
          {patient.country} · {patient.timeZone} ·{" "}
          {patient.program === "earthquake"
            ? "Ayuda Terremoto · todas las sesiones a $0"
            : "Consulta"}
        </p>
        <PracticeNav />
        <nav className="panel-nav" aria-label="Ficha">
          <a href="#sesiones">Sesiones</a>
          <a href="#cobros">Cobros</a>
          <a href="#notas">Notas privadas</a>
          <a href="#seguimiento">Seguimiento</a>
          {patient.conversationId ? (
            <Link
              className="button human"
              href={`/c/${patient.conversationId}`}
            >
              Abrir chat cifrado
            </Link>
          ) : null}
        </nav>
        <PatientNotes
          patientId={patient.id}
          professionalId={pro.id}
          page={query.notas}
        />
        <div className="practice-columns">
          <section id="sesiones">
            <h2>Sesiones y llamadas</h2>
            {appointments.map((a) => (
              <article className="card" key={a.id}>
                <h3>{dateLabel(a.startsAt, zone)}</h3>
                <p>
                  Para el paciente: {dateLabel(a.startsAt, patient.timeZone)}
                </p>
                <p>
                  {appointmentStateLabels[a.status]} ·{" "}
                  {a.modality === "online" ? "En línea" : "Presencial"}
                </p>
                <p className="hint">
                  Aviso de cancelación acordado: {a.cancellationHours} horas. No
                  se cobra ninguna penalización automáticamente.
                </p>
                {a.status === "scheduled" ? (
                  <>
                    <PracticeForm
                      action={updateAppointment}
                      submit="Actualizar sesión"
                    >
                      <input type="hidden" name="appointmentId" value={a.id} />
                      <label>
                        Resultado
                        <select name="status">
                          <option value="completed">Realizada</option>
                          <option value="cancelled">Cancelada</option>
                          <option value="no_show">No asistió</option>
                        </select>
                      </label>
                    </PracticeForm>
                    <details>
                      <summary>Cambiar fecha</summary>
                      <PracticeForm
                        action={rescheduleAppointment}
                        submit="Reprogramar"
                      >
                        <input
                          type="hidden"
                          name="appointmentId"
                          value={a.id}
                        />
                        <label>
                          Nueva fecha y hora en {a.timeZone}
                          <input
                            type="datetime-local"
                            name="startsAt"
                            required
                          />
                        </label>
                      </PracticeForm>
                    </details>
                  </>
                ) : null}
                {a.modality === "online" ? (
                  <p>
                    <Link className="button secondary" href={`/sesion/${a.id}`}>
                      {a.status === "scheduled"
                        ? "Entrar a la llamada"
                        : "Ver archivos de la sesión"}
                    </Link>
                  </p>
                ) : null}
              </article>
            ))}
            {!appointments.length ? <p>Todavía no hay sesiones.</p> : null}
            <PracticePagination
              page={page.sesiones}
              pages={pages.sesiones}
              total={Number(counts?.sessions || 0)}
              href={(number) => historyHref("sesiones", number)}
            />
            <h3>Programar sesión</h3>
            {services.length ? (
              <PracticeForm action={scheduleAppointment} submit="Programar">
                <input type="hidden" name="patientId" value={patient.id} />
                <label>
                  Servicio
                  <select name="serviceId" required>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} · {s.durationMinutes} min
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Usar sesiones incluidas de un acuerdo
                  <select name="careCycleId">
                    <option value="">Sesión independiente</option>
                    {cycles
                      .filter((c) => c.count > Number(c.used))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title} · {c.count - Number(c.used)} sesiones
                          pendientes
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Fecha y hora en {zone}
                  <input type="datetime-local" name="startsAt" required />
                </label>
                <label>
                  Modalidad
                  <select name="modality">
                    <option value="online">En línea</option>
                    <option value="in_person">Presencial</option>
                  </select>
                </label>
              </PracticeForm>
            ) : (
              <Link href="/pro/servicios">
                Crea tu primer servicio para programar →
              </Link>
            )}
          </section>
          <section id="cobros">
            <h2>Cobros</h2>
            {patient.program === "earthquake" ? (
              <div className="card">
                <h3>Acompañamiento gratuito</h3>
                <p>
                  Las citas de este programa siempre se guardan a $0. No puedes
                  registrar cobros aquí.
                </p>
              </div>
            ) : (
              <>
                <p>
                  Los pagos fuera de tarjeta se acuerdan directamente entre tú y
                  el paciente. Este registro es manual.
                </p>
                <PracticeForm
                  action={saveReceipt}
                  submit="Confirmar pago externo"
                >
                  <input type="hidden" name="patientId" value={patient.id} />
                  <label>
                    Importe
                    <input name="amount" inputMode="decimal" required />
                  </label>
                  <CurrencySelect />
                  <input type="hidden" name="receivedTimeZone" value={zone} />
                  <label>
                    Fecha y hora en que recibiste el pago
                    <input
                      type="datetime-local"
                      name="receivedAt"
                      defaultValue={receiptLocalInput(Date.now(), zone)}
                      aria-describedby="receipt-zone"
                      required
                    />
                    <small id="receipt-zone" className="hint">
                      Zona de tu consulta: {zone}. Puedes registrar un pago de
                      otro día. Esta fecha se usa en el historial y las
                      métricas.
                    </small>
                  </label>
                  <label>
                    Método
                    <select name="method">
                      {Object.entries(paymentMethodLabels).map(
                        ([key, value]) => (
                          <option key={key} value={key}>
                            {value}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Referencia propia (sin datos de tarjeta)
                    <input
                      name="reference"
                      required
                      minLength={3}
                      maxLength={80}
                    />
                  </label>
                </PracticeForm>
                <p>
                  <Link href="/pro/dashboard#cobros">
                    Tarjeta: conectar cuenta y compartir paquetes →
                  </Link>
                </p>
                <p className="hint">
                  Los planes mensuales se acuerdan desde Servicios. Los cobros
                  recurrentes al paciente necesitan la integración de pagos
                  habilitada.
                </p>
              </>
            )}
            {receipts.map((r) => (
              <article className="card" key={r.id}>
                <strong>{moneyLabel(r.amountCents, r.currency)}</strong>
                <p>
                  {paymentMethodLabels[r.method]} · recibido el{" "}
                  <time dateTime={r.receivedAt}>
                    {receiptDateLabel(r.receivedAt, zone)}
                  </time>
                </p>
                <small>
                  Registro manual del profesional ·{" "}
                  {r.recordedAt ? (
                    <>
                      guardado en Nido el{" "}
                      <time dateTime={r.recordedAt}>
                        {receiptDateLabel(r.recordedAt, zone)}
                      </time>
                    </>
                  ) : (
                    "fecha de registro no disponible"
                  )}
                  {" · "}Nido no ha procesado ni verificado este pago.
                </small>
              </article>
            ))}
            <PracticePagination
              page={page.cobros}
              pages={pages.cobros}
              total={Number(counts?.receipts || 0)}
              href={(number) => historyHref("cobros", number)}
            />
            {patient.program !== "earthquake" ? (
              <section id="acuerdos">
                <h2>Acuerdos y sesiones incluidas</h2>
                {services.length ? (
                  <PracticeForm
                    action={proposeCare}
                    submit="Proponer acompañamiento"
                  >
                    <input type="hidden" name="patientId" value={patient.id} />
                    <label>
                      Servicio
                      <select name="serviceId">
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title} ·{" "}
                            {s.interval === "month"
                              ? "Mensual"
                              : "Sesión o paquete"}
                          </option>
                        ))}
                      </select>
                    </label>
                  </PracticeForm>
                ) : null}
                {plans.map((p) => (
                  <article className="card" key={p.id}>
                    <h3>{p.title}</h3>
                    {p.status === "needs_review" ? (
                      <p role="alert">
                        El pago de este acuerdo necesita revisión. Consulta al
                        equipo antes de programar nuevas sesiones con sus
                        créditos.
                      </p>
                    ) : null}
                    <p>
                      {p.sessionsCount} sesiones ·{" "}
                      {moneyLabel(p.priceCents, p.currency)}{" "}
                      {p.interval === "month" ? "al mes" : "en total"}
                    </p>
                    <Link href={`/acompanamiento/${p.id}`}>
                      Ver acuerdo y enlace para compartir
                    </Link>
                    {!p.stripeSubscriptionId &&
                    !p.checkoutId &&
                    p.status !== "needs_review" ? (
                      <details>
                        <summary>Confirmar pago externo de un ciclo</summary>
                        <PracticeForm
                          action={confirmExternalCycle}
                          submit="Habilitar sesiones del ciclo"
                        >
                          <input type="hidden" name="carePlanId" value={p.id} />
                          <label>
                            Referencia única del pago
                            <input
                              name="reference"
                              required
                              minLength={3}
                              maxLength={80}
                            />
                          </label>
                          <label className="practice-check">
                            <input type="checkbox" name="confirmed" required />
                            Recibí el importe acordado fuera de Nido y el
                            paciente aceptó las condiciones.
                          </label>
                        </PracticeForm>
                      </details>
                    ) : null}
                  </article>
                ))}
                <PracticePagination
                  page={page.acuerdos}
                  pages={pages.acuerdos}
                  total={Number(counts?.plans || 0)}
                  href={(number) => historyHref("acuerdos", number)}
                />
              </section>
            ) : null}
            <section id="seguimiento">
              <h2>Seguimiento</h2>
              {!patient.conversationId ? (
                <div className="card">
                  <h3>Conectar el acceso del paciente</h3>
                  <p>
                    Comparte tu perfil para que la persona abra un chat contigo.
                    Después vincula esa conversación a esta ficha; así podrá
                    entrar a sus sesiones y acuerdos con su propio acceso.
                  </p>
                  <Link
                    href={`/profesionales?q=${encodeURIComponent(pro.displayName || pro.fullName)}`}
                  >
                    Ver mi perfil en el catálogo →
                  </Link>
                  {availableChats.length ? (
                    <PracticeForm
                      action={linkPatientConversation}
                      submit="Vincular conversación"
                    >
                      <input
                        type="hidden"
                        name="patientId"
                        value={patient.id}
                      />
                      <label>
                        Conversación
                        <select name="conversationId" required>
                          {availableChats.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || "Persona sin alias"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="practice-check">
                        <input type="checkbox" name="confirmed" required />
                        Confirmé que esta conversación corresponde a esta
                        persona y tengo autorización para vincularla.
                      </label>
                    </PracticeForm>
                  ) : (
                    <p className="hint">
                      Todavía no hay chats disponibles de este programa para
                      vincular.
                    </p>
                  )}
                </div>
              ) : null}
              <details>
                <summary>Editar contacto y zona horaria</summary>
                <PracticeForm action={updatePatientContact}>
                  <input type="hidden" name="patientId" value={patient.id} />
                  <label>
                    Nombre o alias
                    <input
                      name="name"
                      defaultValue={patient.name}
                      required
                      maxLength={80}
                    />
                  </label>
                  <label>
                    Correo
                    <input
                      name="email"
                      type="email"
                      defaultValue={patient.email || ""}
                    />
                  </label>
                  <label>
                    País donde recibe atención
                    <input
                      name="country"
                      defaultValue={patient.country}
                      required
                      maxLength={80}
                    />
                  </label>
                  <TimeZoneSelect value={patient.timeZone} />
                  <label className="practice-check">
                    <input type="checkbox" name="consent" required />
                    La persona conoce y autoriza estos datos de contacto.
                  </label>
                </PracticeForm>
              </details>
              <PracticeForm action={setPatientStatus}>
                <input type="hidden" name="patientId" value={patient.id} />
                <label>
                  Estado
                  <select name="status" defaultValue={patient.status}>
                    {Object.entries(patientStateLabels).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </PracticeForm>
              <p className="hint">
                Cerrar la ficha conserva su historial. Para liberar un cupo, usa
                el botón del chat en tu agenda.
              </p>
              <p className="hint">
                Los mensajes se escriben en el chat cifrado. Las notas privadas
                solo están disponibles para el profesional y se almacenan
                cifradas.
              </p>
            </section>
          </section>
        </div>
      </div>
    </section>
  );
}
