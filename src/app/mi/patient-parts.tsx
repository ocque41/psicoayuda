import Link from "next/link";
import { PracticeForm } from "@/components/practice/forms";
import type {
  patientAppointments,
  patientRequests,
} from "@/lib/patient/queries";
import { requestKindLabels, requestStatusLabels } from "@/lib/patient/requests";
import {
  appointmentStateLabels,
  dateLabel,
  moneyLabel,
} from "@/lib/practice/domain";
import { requestPatientSession, withdrawSessionRequest } from "./actions";
import styles from "./mi.module.css";
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
        <article className={styles.requestCard} key={r.id}>
          <span className="workspace-tag">
            {requestStatusLabels[r.status] || r.status}
          </span>
          <h3>
            {requestKindLabels[r.kind]} · {r.name}
          </h3>
          <p className="hint">
            {r.preferredStartsAt
              ? dateLabel(r.preferredStartsAt, timezone)
              : "Sin horario propuesto"}
          </p>
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
