import { and, asc, count, eq } from "drizzle-orm";
import Link from "next/link";
import { PracticeForm } from "@/components/practice/forms";
import { PracticePagination } from "@/components/practice/pagination";
import { db } from "@/db";
import { patientAccounts, patientSessionRequests } from "@/db/patient-schema";
import { conversations, practicePatients, practiceServices } from "@/db/schema";
import { requestKindLabels } from "@/lib/patient/requests";
import { dateLabel } from "@/lib/practice/domain";
import { pageNumber } from "@/lib/practice/queries";
import { reviewPatientSessionRequest } from "./professional-request-actions";
export async function ProfessionalPatientRequests({
  professionalId,
  timezone,
  parameters,
}: {
  professionalId: string;
  timezone: string;
  parameters: Record<string, string | undefined>;
}) {
  const scope = and(
    eq(conversations.professionalId, professionalId),
    eq(patientSessionRequests.status, "pending"),
  );
  const [total] = await db
    .select({ value: count() })
    .from(patientSessionRequests)
    .innerJoin(
      conversations,
      eq(conversations.id, patientSessionRequests.conversationId),
    )
    .innerJoin(
      patientAccounts,
      eq(patientAccounts.userId, patientSessionRequests.userId),
    )
    .where(scope);
  const pages = Math.max(1, Math.ceil(total.value / 20));
  const page = Math.min(pageNumber(parameters.solicitudes), pages);
  const requests = await db
    .select({
      id: patientSessionRequests.id,
      kind: patientSessionRequests.kind,
      preferredStartsAt: patientSessionRequests.preferredStartsAt,
      conversationId: patientSessionRequests.conversationId,
      displayName: patientAccounts.displayName,
      patientId: practicePatients.id,
    })
    .from(patientSessionRequests)
    .innerJoin(
      conversations,
      eq(conversations.id, patientSessionRequests.conversationId),
    )
    .innerJoin(
      patientAccounts,
      eq(patientAccounts.userId, patientSessionRequests.userId),
    )
    .leftJoin(
      practicePatients,
      eq(practicePatients.conversationId, conversations.id),
    )
    .where(scope)
    .orderBy(
      asc(patientSessionRequests.createdAt),
      asc(patientSessionRequests.id),
    )
    .limit(20)
    .offset((page - 1) * 20);
  if (!requests.length) return null;
  const services = await db
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
    .limit(50);
  return (
    <section
      className="workspace-card"
      id="solicitudes"
      aria-labelledby="patient-requests-title"
    >
      <p className="kicker">Desde el espacio del paciente</p>
      <h2 id="patient-requests-title">Solicitudes de sesiones</h2>
      <p className="hint">
        Confirma el horario para guardarlo en ambos calendarios. Acuerda las
        condiciones por chat antes de aceptar una nueva sesión.
      </p>
      <div className="workspace-stack">
        {requests.map((r) => (
          <article className="paper" key={r.id}>
            <span className="workspace-tag">{requestKindLabels[r.kind]}</span>
            <h3>{r.displayName}</h3>
            <p>
              {r.preferredStartsAt
                ? dateLabel(r.preferredStartsAt, timezone)
                : "Solicita cancelar la sesión"}
            </p>
            <div className="panel-nav">
              <Link
                className="button secondary"
                href={`/c/${r.conversationId}`}
              >
                Abrir chat
              </Link>
              {r.patientId ? (
                <Link
                  className="button secondary"
                  href={`/pro/pacientes/${r.patientId}`}
                >
                  Ver ficha
                </Link>
              ) : null}
            </div>
            <PracticeForm
              action={reviewPatientSessionRequest}
              submit="Guardar revisión"
            >
              <input type="hidden" name="requestId" value={r.id} />
              <label>
                Resultado
                <select name="status">
                  <option value="confirmed">
                    Confirmar y actualizar el calendario
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
                      <option value="">Selecciona un servicio</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.title} · {service.duration} minutos
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="practice-check">
                    <input type="checkbox" name="conditionsConfirmed" />
                    La persona y yo hemos acordado duración, modalidad y
                    condiciones de esta sesión.
                  </label>
                </>
              ) : null}
            </PracticeForm>
          </article>
        ))}
      </div>
      <PracticePagination
        total={total.value}
        page={page}
        pages={pages}
        href={(number) => {
          const query = new URLSearchParams();
          for (const [key, value] of Object.entries(parameters))
            if (value) query.set(key, value);
          query.set("solicitudes", String(number));
          return `/pro/consulta?${query}#solicitudes`;
        }}
      />
    </section>
  );
}
