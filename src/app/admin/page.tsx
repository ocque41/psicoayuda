import { desc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import {
  adminAnonymizeHelpRequest,
  adminAssignRequest,
  adminUpdateHelpRequestStatus,
  adminUpdateProfessionalStatus,
} from "@/app/actions";
import { AuthPanel } from "@/components/auth-panel";
import { db } from "@/db";
import { helpRequests, professionals } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { needLabels } from "@/lib/constants";
import { rankProfessionalsForRequest } from "@/lib/matching";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

// Cap the help-request page so its cost stays flat as historical rows grow.
const REQUESTS_PAGE_SIZE = 25;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const admin = await requireAdmin();
  if (!admin) {
    const session = await getServerSession();
    const googleEnabled = Boolean(
      process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim(),
    );

    return (
      <section className="section">
        <div className="container">
          <h1>Admin</h1>
          {session?.user?.email ? (
            <div className="card">
              <p>
                La cuenta <strong>{session.user.email}</strong> no tiene acceso
                de administración.
              </p>
              <p className="muted">
                Entra con una cuenta autorizada: ocquema@gmail.com o
                martinezra@gmail.com.
              </p>
            </div>
          ) : (
            <div className="signin">
              <p className="lead">
                Entra con una cuenta administradora para revisar solicitudes,
                aprobar profesionales y asignar acompañamientos.
              </p>
              <AuthPanel callbackURL="/admin" googleEnabled={googleEnabled} />
              <p className="muted auth-foot">
                Cuentas autorizadas: ocquema@gmail.com y martinezra@gmail.com.
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  const { page: pageParam } = await searchParams;
  const requestedPage = Number.parseInt(pageParam ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * REQUESTS_PAGE_SIZE;

  const [proRows, requestPage] = await Promise.all([
    db.select().from(professionals).orderBy(desc(professionals.createdAt)),
    // Surface actionable requests first (new, then contacted), newest within
    // each bucket. Fetch one extra row to detect a next page without a count.
    db
      .select()
      .from(helpRequests)
      .orderBy(
        sql`case ${helpRequests.status} when 'new' then 0 when 'contacted' then 1 when 'assigned' then 2 else 3 end`,
        desc(helpRequests.createdAt),
      )
      .limit(REQUESTS_PAGE_SIZE + 1)
      .offset(offset),
  ]);

  const hasNextPage = requestPage.length > REQUESTS_PAGE_SIZE;
  const requestRows = hasNextPage
    ? requestPage.slice(0, REQUESTS_PAGE_SIZE)
    : requestPage;
  const hasPrevPage = page > 1;

  const eligibleProfessionals = proRows.filter(
    (professional) =>
      professional.status === "approved" &&
      professional.acceptingRequests &&
      professional.remoteAvailable &&
      professional.currentActiveRequests < professional.maxActiveRequests,
  );

  // Score every request against the eligible pool in memory, reusing the
  // ranking that suggestProfessionalsForRequest applies — no query per request.
  const suggestions = new Map(
    requestRows.map(
      (request) =>
        [
          request.id,
          rankProfessionalsForRequest(eligibleProfessionals, request),
        ] as const,
    ),
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

        {requestRows.length === 0 ? (
          <p className="muted">No hay solicitudes en esta página.</p>
        ) : null}

        {hasPrevPage || hasNextPage ? (
          <nav className="pagination" aria-label="Paginación de solicitudes">
            {hasPrevPage ? (
              <Link
                className="button secondary"
                href={`/admin?page=${page - 1}`}
              >
                ← Anteriores
              </Link>
            ) : (
              <span />
            )}
            <span className="muted">Página {page}</span>
            {hasNextPage ? (
              <Link
                className="button secondary"
                href={`/admin?page=${page + 1}`}
              >
                Siguientes →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </div>
    </section>
  );
}
