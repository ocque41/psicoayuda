import { desc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import {
  adminAnonymizeHelpRequest,
  adminApproveIncompleteRegistration,
  adminAssignRequest,
  adminSetProfessionalKind,
  adminUpdateAllianceStatus,
  adminUpdateHelpRequestStatus,
  adminUpdateProfessionalStatus,
} from "@/app/actions";
import { adminDeleteAccount } from "@/app/actions-account";
import { adminDeletePartner, adminSavePartner } from "@/app/actions-partners";
import { AdminDeleteAccountForm } from "@/components/admin-delete-account-form";
import { AdminFpvBadge } from "@/components/admin-fpv-badge";
import {
  IncompleteRegistrationsSection,
  selectIncompleteRegistrations,
} from "@/components/admin-incomplete-registrations";
import { AdminPartnersSection } from "@/components/admin-partners";
import { AuthPanel } from "@/components/auth-panel";
import { db } from "@/db";
import { allianceRequests, helpRequests, user } from "@/db/schema";
import { getAdminEmails, requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { needLabels, preferredContactLabels } from "@/lib/constants";
import { rankProfessionalsForRequest } from "@/lib/matching";
import { getAllPartnersForAdmin } from "@/lib/partners";
import { whatsappUrl } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

// Cap the help-request page so its cost stays flat as historical rows grow.
const REQUESTS_PAGE_SIZE = 25;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; cuenta?: string }>;
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
                Entra con una cuenta incluida en la configuración de
                administradores.
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
                Usa una cuenta incluida en la configuración de administradores.
              </p>
            </div>
          )}
        </div>
      </section>
    );
  }

  const { page: pageParam, cuenta: accountResult } = await searchParams;
  const requestedPage = Number.parseInt(pageParam ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * REQUESTS_PAGE_SIZE;

  const [proRows, requestPage, accountRows, allianceRows, partnerRows] =
    await Promise.all([
      // Excluimos el documento del comprobante (pesa ~1 MB): la lista admin no lo
      // necesita, y así no arrastramos ese blob por cada profesional (evita repetir
      // el incidente de CPU de /profesionales). Se leería aparte al revisar uno.
      db.query.professionals.findMany({
        columns: { registrationProofDoc: false },
        orderBy: (p, { desc: descOp }) => [descOp(p.createdAt)],
      }),
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
      db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          emailVerified: user.emailVerified,
        })
        .from(user),
      // Solicitudes de alianza: pendientes primero, luego las ya revisadas; dentro
      // de cada grupo, las más recientes arriba.
      db
        .select()
        .from(allianceRequests)
        .orderBy(
          sql`case ${allianceRequests.status} when 'pending' then 0 when 'approved' then 1 else 2 end`,
          desc(allianceRequests.createdAt),
        )
        .limit(100),
      // Aliados (carrusel/escaparate) para gestionarlos desde el panel.
      getAllPartnersForAdmin(),
    ]);

  const hasNextPage = requestPage.length > REQUESTS_PAGE_SIZE;
  const requestRows = hasNextPage
    ? requestPage.slice(0, REQUESTS_PAGE_SIZE)
    : requestPage;
  const hasPrevPage = page > 1;
  const incompleteRegistrations = selectIncompleteRegistrations(
    accountRows,
    proRows.map((professional) => professional.userId),
    getAdminEmails(),
  );
  const accountEmailByUserId = new Map(
    accountRows.map((accountRow) => [accountRow.id, accountRow.email]),
  );
  const adminEmails = new Set(getAdminEmails());

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
    <section className="section admin">
      <div className="container">
        <h1>Admin</h1>
        <p className="muted">Sesión admin: {admin.email}</p>
        {accountResult === "borrada" ? (
          <p className="status-message" role="status">
            La cuenta y sus sesiones se borraron correctamente.
          </p>
        ) : null}
        {accountResult === "protegida" ? (
          <p className="form-error" role="alert">
            Las cuentas administradoras están protegidas y no se pueden borrar
            desde este panel.
          </p>
        ) : null}
        {accountResult === "no-encontrada" ? (
          <p className="form-error" role="alert">
            La cuenta ya no existe o no se pudo identificar.
          </p>
        ) : null}
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
                <th>Tipo</th>
                <th>FPV</th>
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
                    <form action={adminSetProfessionalKind}>
                      <input
                        name="professionalId"
                        type="hidden"
                        value={professional.id}
                      />
                      <select
                        name="kind"
                        defaultValue={
                          professional.nonClinicalHelper
                            ? "non_clinical"
                            : "certified"
                        }
                        aria-label="Tipo de profesional"
                      >
                        <option value="certified">Certificado</option>
                        <option value="non_clinical">
                          Auxiliar no clínico
                        </option>
                      </select>{" "}
                      <button className="button secondary" type="submit">
                        Guardar
                      </button>
                    </form>
                  </td>
                  <td>
                    <AdminFpvBadge
                      fpvVerified={professional.fpvVerified}
                      fpvNumber={professional.fpvNumber}
                      fpvSnapshot={professional.fpvSnapshot}
                    />
                  </td>
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
                    {!adminEmails.has(
                      accountEmailByUserId.get(professional.userId) ?? "",
                    ) ? (
                      <AdminDeleteAccountForm
                        action={adminDeleteAccount}
                        userId={professional.userId}
                        accountLabel={professional.email}
                      />
                    ) : (
                      <span className="muted">Cuenta administradora</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <IncompleteRegistrationsSection
          registrations={incompleteRegistrations}
          deleteAction={adminDeleteAccount}
          approveAction={adminApproveIncompleteRegistration}
        />

        <h2>Alianzas y organizaciones</h2>
        {allianceRows.length ? (
          <div className="grid">
            {allianceRows.map((alliance) => {
              const websiteHref = alliance.website
                ? /^https?:\/\//i.test(alliance.website)
                  ? alliance.website
                  : `https://${alliance.website}`
                : null;
              const waHref = whatsappUrl(alliance.phone);
              const preferredLabel = alliance.preferredContact
                ? (preferredContactLabels[
                    alliance.preferredContact as keyof typeof preferredContactLabels
                  ] ?? alliance.preferredContact)
                : null;
              return (
                <article className="card" key={alliance.id}>
                  <h3>{alliance.organizationName}</h3>
                  <p className="muted">Estado: {alliance.status}</p>
                  {preferredLabel ? (
                    <p>
                      <strong>Forma más rápida:</strong> {preferredLabel}
                    </p>
                  ) : null}
                  <p>
                    <strong>Contacto:</strong> {alliance.contactName}
                    <br />
                    <strong>Correo:</strong>{" "}
                    <a href={`mailto:${alliance.email}`}>{alliance.email}</a>
                    {alliance.phone ? (
                      <>
                        <br />
                        <strong>Teléfono:</strong> {alliance.phone}
                        {waHref ? (
                          <>
                            {" · "}
                            <a href={waHref} target="_blank" rel="noreferrer">
                              WhatsApp
                            </a>
                            {" · "}
                            <a href={`tel:${alliance.phone}`}>Llamar</a>
                          </>
                        ) : null}
                      </>
                    ) : null}
                    {websiteHref ? (
                      <>
                        <br />
                        <strong>Web:</strong>{" "}
                        <a href={websiteHref} target="_blank" rel="noreferrer">
                          {alliance.website}
                        </a>
                      </>
                    ) : null}
                  </p>
                  {alliance.message ? (
                    <p style={{ whiteSpace: "pre-wrap" }}>{alliance.message}</p>
                  ) : null}

                  <form action={adminUpdateAllianceStatus}>
                    <input
                      name="allianceId"
                      type="hidden"
                      value={alliance.id}
                    />
                    {alliance.status !== "approved" ? (
                      <button
                        className="button"
                        type="submit"
                        name="status"
                        value="approved"
                      >
                        Aprobar
                      </button>
                    ) : null}{" "}
                    {alliance.status !== "rejected" ? (
                      <button
                        className="button secondary"
                        type="submit"
                        name="status"
                        value="rejected"
                      >
                        Rechazar
                      </button>
                    ) : null}{" "}
                    {alliance.status !== "pending" ? (
                      <button
                        className="button secondary"
                        type="submit"
                        name="status"
                        value="pending"
                      >
                        Volver a pendiente
                      </button>
                    ) : null}
                  </form>
                  {alliance.reviewedBy ? (
                    <p className="muted">Revisada por {alliance.reviewedBy}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">No hay solicitudes de alianza.</p>
        )}

        <AdminPartnersSection
          partners={partnerRows}
          saveAction={adminSavePartner}
          deleteAction={adminDeletePartner}
        />

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
