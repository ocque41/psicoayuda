import Link from "next/link";
import { PracticeForm } from "@/components/practice/forms";
import {
  linkedRequestTimeLabel,
  type RequestContextData,
  requestDateText,
  requestNextStep,
  requestReasonText,
  requestStatusText,
} from "@/lib/patient/professional-requests";
import type {
  patientAppointments,
  patientRequests,
} from "@/lib/patient/queries";
import { requestKindLabels } from "@/lib/patient/requests";
import {
  appointmentStateLabels,
  dateLabel,
  moneyLabel,
} from "@/lib/practice/domain";
import { requestPatientSession, withdrawSessionRequest } from "./actions";
import styles from "./mi.module.css";
import requestStyles from "./requests.module.css";
export function AppointmentList({
  rows,
  timezone,
  controls = false,
}: {
  rows: Awaited<ReturnType<typeof patientAppointments>>["rows"];
  timezone: string;
  controls?: boolean;
}) {
  return rows.length ? (
    <div>
      {rows.map((a) => (
        <article key={a.id} className={styles.row}>
          <div className={styles.inline}>
            <span className={styles.icon} aria-hidden="true">
              ◷
            </span>
            <div className={styles.rowMain}>
              <p className={styles.date}>{dateLabel(a.startsAt, timezone)}</p>
              <h3>{a.name}</h3>
              <p className="hint">
                {appointmentStateLabels[a.status] || a.status} ·{" "}
                {a.modality === "online" ? "En línea" : "Presencial"}
                {a.program === "earthquake"
                  ? " · Ayuda Terremoto · gratuita"
                  : ` · ${moneyLabel(a.priceCents, a.currency)}`}
              </p>
              {controls && a.status === "scheduled" ? (
                <details className={styles.details}>
                  <summary>Cambiar o cancelar</summary>
                  <p className="hint">
                    La antelación acordada es de {a.cancellationHours} horas. El
                    profesional confirmará el cambio; Nido no aplica
                    penalizaciones automáticas.
                  </p>
                  <PracticeForm
                    action={requestPatientSession}
                    submit="Enviar solicitud"
                  >
                    <input
                      type="hidden"
                      name="conversationId"
                      value={a.conversationId}
                    />
                    <input type="hidden" name="appointmentId" value={a.id} />
                    <label>
                      Qué necesitas
                      <select name="kind" defaultValue="reschedule">
                        <option value="reschedule">
                          Proponer otro horario
                        </option>
                        <option value="cancel">Solicitar cancelación</option>
                      </select>
                    </label>
                    <label>
                      Horario propuesto · {timezone}
                      <input name="preferredLocal" type="datetime-local" />
                    </label>
                    <label>
                      Motivo
                      <select name="reason">
                        <option value="schedule">Cambio de horario</option>
                        <option value="unavailable">No puedo asistir</option>
                        <option value="no_longer_needed">
                          Ya no necesito esta sesión
                        </option>
                        <option value="other">
                          Prefiero acordarlo por chat
                        </option>
                      </select>
                    </label>
                  </PracticeForm>
                </details>
              ) : null}
            </div>
          </div>
          <Link
            className="button secondary"
            prefetch={false}
            href={`/mi/mensajes/${a.conversationId}`}
          >
            Abrir chat
          </Link>
        </article>
      ))}
    </div>
  ) : (
    <div className="workspace-empty">
      <p>
        Aquí aparecerán tus sesiones cuando las confirmes con un profesional.
      </p>
      <Link className="button secondary" href="/mi/nueva-sesion">
        Solicitar una sesión
      </Link>
    </div>
  );
}
export function RequestList({
  rows,
  timezone,
}: {
  rows: Awaited<ReturnType<typeof patientRequests>>;
  timezone: string;
}) {
  return (
    <div className="workspace-stack">
      {rows.map((r) => (
        <article className={requestStyles.card} key={r.id}>
          <div className={requestStyles.header}>
            <span className="workspace-tag">{requestStatusText(r)}</span>
          </div>
          <h3>
            {requestKindLabels[r.kind]} · {r.name}
          </h3>
          <RequestContext
            request={r}
            timezone={timezone}
            otherTimezone={r.professionalTimezone}
            audience="patient"
          />
          <div className="panel-nav">
            <Link
              className="button secondary"
              prefetch={false}
              href={`/mi/mensajes/${r.conversationId}`}
            >
              Abrir chat
            </Link>
            {r.status === "confirmed" ? (
              <Link className="button secondary" href="/mi/calendario">
                Ver calendario
              </Link>
            ) : null}
          </div>
          {r.status === "pending" ? (
            <PracticeForm
              action={withdrawSessionRequest}
              submit="Retirar solicitud"
            >
              <input type="hidden" name="requestId" value={r.id} />
            </PracticeForm>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/** Contexto operativo compartido: sin relato clínico ni decisión automática. */
export function RequestContext({
  request,
  timezone,
  otherTimezone,
  audience,
}: {
  request: RequestContextData;
  timezone: string;
  otherTimezone: string;
  audience: "patient" | "professional";
}) {
  function times(iso: string, savedTimezone?: string | null) {
    const zones = [timezone, otherTimezone, savedTimezone].filter(
      (zone, index, all): zone is string =>
        Boolean(zone) && all.indexOf(zone) === index,
    );
    return zones.map((zone) => (
      <span className={requestStyles.time} key={zone}>
        <time dateTime={iso}>{requestDateText(iso, zone)}</time>
        <small className={requestStyles.zone}>
          {zone === timezone
            ? "Tu horario"
            : zone === otherTimezone
              ? audience === "patient"
                ? "Horario del profesional"
                : "Horario del paciente"
              : "Zona guardada en la sesión"}
          {" · "}
          {zone.replaceAll("_", " ")}
        </small>
      </span>
    ));
  }
  return (
    <>
      <dl className={requestStyles.context}>
        <div>
          <dt>Solicitud enviada</dt>
          <dd>
            <time dateTime={request.createdAt}>
              {requestDateText(request.createdAt, timezone)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Motivo operativo</dt>
          <dd>{requestReasonText(request.reason)}</dd>
        </div>
        {request.kind !== "new" || request.linkedStartsAt ? (
          <div>
            <dt>{linkedRequestTimeLabel(request)}</dt>
            <dd>
              {request.linkedStartsAt
                ? times(request.linkedStartsAt, request.linkedTimeZone)
                : "Sesión vinculada no disponible"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>
            {request.kind === "cancel"
              ? "Cambio solicitado"
              : "Horario propuesto"}
          </dt>
          <dd>
            {request.kind === "cancel"
              ? "Cancelar la sesión vinculada"
              : request.preferredStartsAt
                ? times(request.preferredStartsAt, request.timezone)
                : "Sin horario propuesto"}
          </dd>
        </div>
        {request.status !== "pending" ? (
          <div>
            <dt>Última respuesta o retirada</dt>
            <dd>
              <time dateTime={request.updatedAt}>
                {requestDateText(request.updatedAt, timezone)}
              </time>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className={requestStyles.next}>
        <strong>Siguiente paso</strong>
        <p>{requestNextStep(request, audience)}</p>
      </div>
    </>
  );
}
