import { needLabels, urgencyLabels } from "@/lib/constants";

type Action = (formData: FormData) => Promise<void>;

type RequestSummary = {
  id: string;
  email: string;
  needCategory: string;
  urgency: string;
  status: string;
  city: string | null;
  state: string | null;
  country: string | null;
};

type EligibleProfessional = {
  id: string;
  displayName: string | null;
  fullName: string;
  currentActiveRequests: number;
  maxActiveRequests: number;
};

type Suggestion = {
  professional: EligibleProfessional;
  score: number;
  reasons: string[];
};

type Distribution = {
  offered: number;
  missed: number;
  takers: string[];
};

const statusLabels: Record<string, string> = {
  new: "Nueva",
  contacted: "Contactada",
  assigned: "Asignada",
  closed: "Cerrada",
};

function requestNeedLabel(request: RequestSummary) {
  return (
    needLabels[request.needCategory as keyof typeof needLabels] ??
    request.needCategory
  );
}

function requestUrgencyLabel(request: RequestSummary) {
  return (
    urgencyLabels[request.urgency as keyof typeof urgencyLabels] ??
    request.urgency
  );
}

function distributionText(distribution?: Distribution) {
  if (distribution?.takers.length) {
    return `La tiene ${distribution.takers.join(", ")}`;
  }
  if (distribution?.offered) {
    return `En el panel de ${distribution.offered} profesional${
      distribution.offered === 1 ? "" : "es"
    }`;
  }
  return "No difundida todavía";
}

function AdminRequestStatusForm({
  request,
  action,
}: {
  request: RequestSummary;
  action: Action;
}) {
  return (
    <form action={action}>
      <input name="requestId" type="hidden" value={request.id} />
      <select name="status" defaultValue={request.status}>
        <option value="new">Nueva</option>
        <option value="contacted">Contactada</option>
        <option value="assigned">Asignada</option>
        <option value="closed">Cerrada</option>
      </select>
      <button className="button secondary" type="submit">
        Cambiar estado
      </button>
    </form>
  );
}

function AdminRequestSuggestion({
  requestId,
  suggestion,
  action,
}: {
  requestId: string;
  suggestion: Suggestion;
  action: Action;
}) {
  const { professional, reasons } = suggestion;
  const name = professional.displayName || professional.fullName;

  return (
    <form action={action} className="admin-suggestion">
      <input name="helpRequestId" type="hidden" value={requestId} />
      <input name="professionalId" type="hidden" value={professional.id} />
      <div className="admin-suggestion-body">
        <strong>{name}</strong>
        <span className="muted">
          {professional.currentActiveRequests}/{professional.maxActiveRequests}{" "}
          personas
        </span>
        {reasons.length ? (
          <ul className="chips admin-reason-list" aria-label="Razones">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <button className="button" type="submit">
        Asignar
      </button>
    </form>
  );
}

export function AdminRequestCard({
  request,
  distribution,
  suggestions,
  eligibleProfessionals,
  updateStatusAction,
  anonymizeAction,
  assignAction,
}: {
  request: RequestSummary;
  distribution?: Distribution;
  suggestions: Suggestion[];
  eligibleProfessionals: EligibleProfessional[];
  updateStatusAction: Action;
  anonymizeAction: Action;
  assignAction: Action;
}) {
  return (
    <article className="card admin-request-card">
      <div className="admin-request-head">
        <div>
          <h3>{requestNeedLabel(request)}</h3>
          <p className="muted">
            Urgencia: {requestUrgencyLabel(request)} · Estado:{" "}
            {statusLabels[request.status] ?? request.status}
          </p>
        </div>
        <span className={`panel-chip admin-status-${request.status}`}>
          {statusLabels[request.status] ?? request.status}
        </span>
      </div>

      <dl className="admin-request-meta">
        <div>
          <dt>Contacto</dt>
          <dd>
            <a href={`mailto:${request.email}`}>{request.email}</a>
          </dd>
        </div>
        <div>
          <dt>Ubicación</dt>
          <dd>
            {request.city || "Ciudad no indicada"},{" "}
            {request.state || "estado no indicado"},{" "}
            {request.country || "país no indicado"}
          </dd>
        </div>
        <div>
          <dt>Distribución</dt>
          <dd>
            {distributionText(distribution)}
            {distribution?.missed
              ? ` · ${distribution.missed} la vieron pasar`
              : ""}
          </dd>
        </div>
      </dl>

      <div className="admin-request-actions">
        <AdminRequestStatusForm request={request} action={updateStatusAction} />
        <form action={anonymizeAction}>
          <input name="requestId" type="hidden" value={request.id} />
          <button className="button secondary" type="submit">
            Anonimizar datos
          </button>
        </form>
      </div>

      <h4>Sugerencias</h4>
      {suggestions.length ? (
        <div className="admin-suggestions">
          {suggestions.map((suggestion) => (
            <AdminRequestSuggestion
              action={assignAction}
              key={suggestion.professional.id}
              requestId={request.id}
              suggestion={suggestion}
            />
          ))}
        </div>
      ) : (
        <p className="muted">No hay sugerencias bajo capacidad.</p>
      )}

      <h4>Asignación manual</h4>
      {eligibleProfessionals.length ? (
        <form action={assignAction} className="admin-manual-assignment">
          <input name="helpRequestId" type="hidden" value={request.id} />
          <select name="professionalId" aria-label="Profesional">
            {eligibleProfessionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.displayName || professional.fullName} (
                {professional.currentActiveRequests}/
                {professional.maxActiveRequests})
              </option>
            ))}
          </select>
          <button className="button" type="submit">
            Asignar seleccionado
          </button>
        </form>
      ) : (
        <p className="muted">
          No hay profesionales aprobados disponibles bajo capacidad.
        </p>
      )}
    </article>
  );
}
