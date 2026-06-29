import { desc } from "drizzle-orm";
import Link from "next/link";
import {
  adminAnonymizeHelpRequest,
  adminAssignRequest,
  adminUpdateHelpRequestStatus,
  adminUpdateProfessionalStatus,
} from "@/app/actions";
import { db } from "@/db";
import { helpRequests, professionals } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { needLabels } from "@/lib/constants";
import { suggestProfessionalsForRequest } from "@/lib/matching";

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <section className="section">
        <div className="container">
          <h1>Admin</h1>
          <p>No tienes acceso a esta página.</p>
        </div>
      </section>
    );
  }

  const [proRows, requestRows] = await Promise.all([
    db.select().from(professionals).orderBy(desc(professionals.createdAt)),
    db.select().from(helpRequests).orderBy(desc(helpRequests.createdAt)),
  ]);

  const suggestions = new Map(
    await Promise.all(
      requestRows.map(
        async (request) =>
          [
            request.id,
            await suggestProfessionalsForRequest(request.id),
          ] as const,
      ),
    ),
  );
  const eligibleProfessionals = proRows.filter(
    (professional) =>
      professional.status === "approved" &&
      professional.acceptingRequests &&
      professional.remoteAvailable &&
      professional.currentActiveRequests < professional.maxActiveRequests,
  );

  return (
    <section className="section">
      <div className="container">
        <h1>Admin</h1>
        <p className="muted">Sesión admin: {admin.email}</p>
        <p>
          <Link className="button secondary" href="/admin/export">
            Exportar solicitudes CSV
          </Link>
        </p>

        <h2>Profesionales</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Estado</th>
                <th>Capacidad</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {proRows.map((professional) => (
                <tr key={professional.id}>
                  <td>
                    <strong>{professional.fullName}</strong>
                    <br />
                    <span className="muted">{professional.licenseCountry}</span>
                  </td>
                  <td>{professional.email}</td>
                  <td>{professional.status}</td>
                  <td>
                    {professional.currentActiveRequests}/
                    {professional.maxActiveRequests}
                    <br />
                    {professional.acceptingRequests ? "Acepta" : "No acepta"}
                  </td>
                  <td>
                    <form action={adminUpdateProfessionalStatus}>
                      <input
                        name="professionalId"
                        type="hidden"
                        value={professional.id}
                      />
                      <select name="status" defaultValue={professional.status}>
                        <option value="pending_verification">Pendiente</option>
                        <option value="approved">Aprobar</option>
                        <option value="rejected">Rechazar</option>
                        <option value="suspended">Suspender</option>
                      </select>{" "}
                      <button className="button secondary" type="submit">
                        Guardar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Solicitudes</h2>
        <div className="grid">
          {requestRows.map((request) => {
            const requestSuggestions = suggestions.get(request.id) ?? [];
            return (
              <article className="card" key={request.id}>
                <h3>{request.email}</h3>
                <p>
                  {needLabels[
                    request.needCategory as keyof typeof needLabels
                  ] ?? request.needCategory}{" "}
                  · urgencia {request.urgency} · estado {request.status}
                </p>
                <p className="muted">
                  {request.city || "Ciudad no indicada"},{" "}
                  {request.state || "estado no indicado"},{" "}
                  {request.country || "país no indicado"}
                </p>

                <form action={adminUpdateHelpRequestStatus}>
                  <input name="requestId" type="hidden" value={request.id} />
                  <select name="status" defaultValue={request.status}>
                    <option value="new">Nueva</option>
                    <option value="contacted">Contactada</option>
                    <option value="assigned">Asignada</option>
                    <option value="closed">Cerrada</option>
                  </select>{" "}
                  <button className="button secondary" type="submit">
                    Cambiar estado
                  </button>
                </form>

                <form action={adminAnonymizeHelpRequest}>
                  <input name="requestId" type="hidden" value={request.id} />
                  <button className="button secondary" type="submit">
                    Anonimizar datos
                  </button>
                </form>

                <h4>Sugerencias</h4>
                {requestSuggestions.length ? (
                  <div className="grid">
                    {requestSuggestions.map(({ professional, score }) => (
                      <form action={adminAssignRequest} key={professional.id}>
                        <input
                          name="helpRequestId"
                          type="hidden"
                          value={request.id}
                        />
                        <input
                          name="professionalId"
                          type="hidden"
                          value={professional.id}
                        />
                        <span>
                          {professional.displayName || professional.fullName} ·
                          score {score} · {professional.currentActiveRequests}/
                          {professional.maxActiveRequests}
                        </span>{" "}
                        <button className="button" type="submit">
                          Asignar
                        </button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No hay sugerencias bajo capacidad.</p>
                )}

                <h4>Asignación manual</h4>
                {eligibleProfessionals.length ? (
                  <form action={adminAssignRequest}>
                    <input
                      name="helpRequestId"
                      type="hidden"
                      value={request.id}
                    />
                    <select name="professionalId" aria-label="Profesional">
                      {eligibleProfessionals.map((professional) => (
                        <option key={professional.id} value={professional.id}>
                          {professional.displayName || professional.fullName} (
                          {professional.currentActiveRequests}/
                          {professional.maxActiveRequests})
                        </option>
                      ))}
                    </select>{" "}
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
          })}
        </div>
      </div>
    </section>
  );
}
