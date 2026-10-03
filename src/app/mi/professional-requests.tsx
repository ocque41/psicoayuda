import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { PracticeForm } from "@/components/practice/forms";
import { PracticePagination } from "@/components/practice/pagination";
import { db } from "@/db";
import { practiceServices } from "@/db/schema";
import {
  professionalPatientRequests,
  requestFilters,
  requestPageHref,
  requestStatusText,
} from "@/lib/patient/professional-requests";
import { requestKindLabels } from "@/lib/patient/requests";
import { RequestContext } from "./patient-parts";
import { reviewPatientSessionRequest } from "./professional-request-actions";
import styles from "./requests.module.css";

export async function ProfessionalPatientRequests({
  professionalId,
  timezone,
  parameters,
}: {
  professionalId: string;
  timezone: string;
  parameters: Record<string, string | undefined>;
}) {
  const results = await professionalPatientRequests(
    professionalId,
    timezone,
    parameters,
  );
  const services = results.rows.some(
    (r) => r.status === "pending" && r.kind === "new",
  )
    ? await db
        .select({
          id: practiceServices.id,
          title: practiceServices.title,
          duration: practiceServices.durationMinutes,
        })
        .from(practiceServices)
        .where(
          and(
            eq(practiceServices.professionalId, professionalId),
            eq(practiceServices.active, true),
          ),
        )
        .limit(50)
    : [];
  return (
    <section
      className="workspace-card"
      id="solicitudes"
      aria-labelledby="patient-requests-title"
    >
      <p className="kicker">Desde el espacio del paciente</p>
      <h2 id="patient-requests-title">Solicitudes e historial</h2>
      <p className="hint">
        Revisa las pendientes o consulta decisiones anteriores. Solo confirmar
        guarda el cambio en el calendario; revisar o rechazar permite continuar
        por chat.
      </p>
      <form
        method="get"
        action="/pro/consulta#solicitudes"
        className={styles.filters}
      >
        {Object.entries(parameters)
          .filter(
            ([key, value]) =>
              value &&
              ![
                "solicitudes",
                "solicitudes_estado",
                "solicitudes_desde",
                "solicitudes_hasta",
              ].includes(key),
          )
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <label>
          Estado
          <select
            name="solicitudes_estado"
            defaultValue={results.filters.state}
          >
            {requestFilters.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Enviadas desde
          <input
            type="date"
            name="solicitudes_desde"
            defaultValue={results.filters.from}
          />
        </label>
        <label>
          Enviadas hasta
          <input
            type="date"
            name="solicitudes_hasta"
            defaultValue={results.filters.until}
          />
        </label>
        <button type="submit" className="button secondary">
          Aplicar filtros
        </button>
      </form>
      <p className="hint">
        Fechas de envío en tu zona: {timezone.replaceAll("_", " ")}. Las
        pendientes aparecen de más antigua a más reciente.
      </p>
      {results.filters.error ? (
        <p role="status">{results.filters.error}</p>
      ) : null}
      <div className="workspace-stack">
        {results.rows.map((r) => (
          <article className={styles.card} key={r.id}>
            <div className={styles.header}>
              <span className="workspace-tag">{requestStatusText(r)}</span>
              <span className="workspace-tag">
                {requestKindLabels[r.kind] || "Solicitud de sesión"}
              </span>
            </div>
            <h3>{r.displayName}</h3>
            <RequestContext
              request={r}
              timezone={timezone}
              otherTimezone={r.timezone}
              audience="professional"
            />
            <div className="panel-nav">
              <Link
                className="button secondary"
                prefetch={false}
                href={`/c/${r.conversationId}`}
              >
                Abrir chat
              </Link>
              {r.patientId ? (
                <Link
                  className="button secondary"
                  prefetch={false}
                  href={`/pro/pacientes/${r.patientId}`}
                >
                  Ver ficha
                </Link>
              ) : null}
            </div>
            {r.status === "pending" ? (
              <details className={styles.decision}>
                <summary>Revisar y responder</summary>
                <PracticeForm
                  action={reviewPatientSessionRequest}
                  submit="Guardar decisión"
                >
                  <input type="hidden" name="requestId" value={r.id} />
                  <label>
                    Resultado
                    <select name="status" defaultValue="" required>
                      <option value="" disabled>
                        Elige una decisión
                      </option>
                      <option value="confirmed">
                        {r.kind === "cancel"
                          ? "Confirmar cancelación y actualizar calendario"
                          : "Confirmar y actualizar el calendario"}
                      </option>
                      <option value="reviewed">
                        Revisada · continuar por chat
                      </option>
                      <option value="declined">
                        Horario o cambio no disponible
                      </option>
                    </select>
                  </label>
                  {r.kind === "new" ? (
                    <>
                      <label>
                        Servicio
                        <select name="serviceId">
                          <option value="">
                            Selecciona un servicio para confirmar
                          </option>
                          {services.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.title} · {service.duration} minutos
                            </option>
                          ))}
                        </select>
                      </label>
                      {!services.length ? (
                        <p className="hint">
                          Crea un servicio activo antes de confirmar una nueva
                          sesión. Puedes continuar la coordinación por chat.
                        </p>
                      ) : null}
                      <label className="practice-check">
                        <input type="checkbox" name="conditionsConfirmed" />
                        La persona y yo hemos acordado duración, modalidad y
                        condiciones de esta sesión.
                      </label>
                    </>
                  ) : null}
                </PracticeForm>
              </details>
            ) : null}
          </article>
        ))}
        {!results.rows.length ? (
          <div className="workspace-empty">
            <p>
              No hay solicitudes con estos filtros. Elige otro estado o ajusta
              las fechas para consultar el historial.
            </p>
          </div>
        ) : null}
      </div>
      <PracticePagination
        {...results}
        href={(number) => requestPageHref(parameters, number)}
      />
    </section>
  );
}
