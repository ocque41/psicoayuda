import {
  and,
  count,
  desc,
  eq,
  inArray,
  like,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import {
  adminAnonymizeHelpRequest,
  adminApproveIncompleteRegistration,
  adminAssignRequest,
  adminSetCredentialConfirmed,
  adminSetProfessionalKind,
  adminSetProfessionalVisibility,
  adminUpdateAllianceStatus,
  adminUpdateHelpRequestStatus,
  adminUpdateProfessionalStatus,
} from "@/app/actions";
import { adminDeleteAccount } from "@/app/actions-account";
import { adminUpdateContactMessageStatus } from "@/app/actions-contact";
import { adminDeletePartner, adminSavePartner } from "@/app/actions-partners";
import { AdminContactInbox } from "@/components/admin-contact-inbox";
import { AdminDeleteAccountForm } from "@/components/admin-delete-account-form";
import { AdminFpvBadge } from "@/components/admin-fpv-badge";
import {
  IncompleteRegistrationsSection,
  selectIncompleteRegistrations,
} from "@/components/admin-incomplete-registrations";
import { AdminPartnersSection } from "@/components/admin-partners";
import { AdminRequestCard } from "@/components/admin-request-card";
import { AuthPanel } from "@/components/auth-panel";
import { MetricsDashboard } from "@/components/metrics-dashboard";
import { db } from "@/db";
import {
  allianceRequests,
  assignments,
  contactMessages,
  helpRequests,
  professionals,
  user,
} from "@/db/schema";
import { getAdminEmails, requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { preferredContactLabels, urgencyLabels } from "@/lib/constants";
import {
  type ContactCategory,
  type ContactSource,
  type ContactStatus,
  contactCategories,
  contactSources,
  contactStatuses,
} from "@/lib/contact-messages";
import { rankProfessionalsForRequest } from "@/lib/matching";
import { getAllPartnersForAdmin } from "@/lib/partners";
import { whatsappUrl } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Administración",
  robots: { index: false, follow: false },
};

// Cap the help-request page so its cost stays flat as historical rows grow.
const REQUESTS_PAGE_SIZE = 25;
const requestStatusOptions = [
  "new",
  "contacted",
  "assigned",
  "closed",
] as const;
const requestUrgencyOptions = ["baja", "media", "alta"] as const;

function normalizeOption<T extends readonly string[]>(
  value: string | undefined,
  options: T,
): T[number] | "" {
  return options.includes(value ?? "") ? (value as T[number]) : "";
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    cuenta?: string;
    estado?: string;
    urgencia?: string;
    q?: string;
    contacto_estado?: string;
    contacto_origen?: string;
    contacto_motivo?: string;
  }>;
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

  const {
    page: pageParam,
    cuenta: accountResult,
    estado,
    urgencia,
    q,
    contacto_estado,
    contacto_origen,
    contacto_motivo,
  } = await searchParams;
  const requestedPage = Number.parseInt(pageParam ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * REQUESTS_PAGE_SIZE;
  const statusFilter = normalizeOption(estado, requestStatusOptions);
  const urgencyFilter = normalizeOption(urgencia, requestUrgencyOptions);
  const queryFilter = (q ?? "").trim().slice(0, 80);
  const contactStatusFilter = normalizeOption(contacto_estado, contactStatuses);
  const contactSourceFilter = normalizeOption(contacto_origen, contactSources);
  const contactCategoryFilter = normalizeOption(
    contacto_motivo,
    contactCategories,
  );
  const requestFilters: SQL[] = [];
  if (statusFilter) requestFilters.push(eq(helpRequests.status, statusFilter));
  if (urgencyFilter)
    requestFilters.push(eq(helpRequests.urgency, urgencyFilter));
  if (queryFilter) {
    const term = `%${queryFilter}%`;
    const queryWhere = or(
      like(helpRequests.email, term),
      like(helpRequests.seekerName, term),
      like(helpRequests.city, term),
      like(helpRequests.state, term),
      like(helpRequests.country, term),
      like(helpRequests.needCategory, term),
    );
    if (queryWhere) requestFilters.push(queryWhere);
  }
  const requestWhere = requestFilters.length
    ? and(...requestFilters)
    : undefined;
  const contactFilters: SQL[] = [];
  if (contactStatusFilter)
    contactFilters.push(eq(contactMessages.status, contactStatusFilter));
  if (contactSourceFilter)
    contactFilters.push(eq(contactMessages.source, contactSourceFilter));
  if (contactCategoryFilter)
    contactFilters.push(eq(contactMessages.category, contactCategoryFilter));
  const contactWhere = contactFilters.length
    ? and(...contactFilters)
    : undefined;
  const adminPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("estado", statusFilter);
    if (urgencyFilter) params.set("urgencia", urgencyFilter);
    if (queryFilter) params.set("q", queryFilter);
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `/admin?${query}` : "/admin";
  };

  const [
    proRows,
    requestPage,
    accountRows,
    allianceRows,
    partnerRows,
    contactRows,
  ] = await Promise.all([
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
      .where(requestWhere)
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
    db
      .select()
      .from(contactMessages)
      .where(contactWhere)
      .orderBy(desc(contactMessages.createdAt))
      .limit(100),
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

  // Distribución de cada solicitud entre los profesionales: para COMPROBAR de un
  // vistazo a cuántos paneles llegó, quién la tiene y cuántos la vieron pasar.
  // Una sola consulta para las solicitudes de la página (no una por fila).
  const requestIds = requestRows.map((request) => request.id);
  const assignmentRows = requestIds.length
    ? await db
        .select({
          helpRequestId: assignments.helpRequestId,
          status: assignments.status,
          displayName: professionals.displayName,
          fullName: professionals.fullName,
        })
        .from(assignments)
        .innerJoin(
          professionals,
          eq(assignments.professionalId, professionals.id),
        )
        .where(inArray(assignments.helpRequestId, requestIds))
    : [];

  const distribution = new Map<
    string,
    { offered: number; missed: number; takers: string[] }
  >();
  for (const row of assignmentRows) {
    const entry = distribution.get(row.helpRequestId) ?? {
      offered: 0,
      missed: 0,
      takers: [],
    };
    const name = row.displayName || row.fullName;
    if (row.status === "offered") entry.offered += 1;
    else if (row.status === "missed") entry.missed += 1;
    else if (row.status === "accepted" || row.status === "assigned")
      entry.takers.push(name);
    distribution.set(row.helpRequestId, entry);
  }

  // Total de solicitudes SIN atender (para el atajo del menú superior).
  const [newRequestRow] = await db
    .select({ total: count() })
    .from(helpRequests)
    .where(eq(helpRequests.status, "new"));
  const newRequestCount = newRequestRow?.total ?? 0;
  const contactCountRows = await db
    .select({ status: contactMessages.status, total: count() })
    .from(contactMessages)
    .groupBy(contactMessages.status);
  const contactCounts: Record<ContactStatus, number> = {
    new: 0,
    in_review: 0,
    resolved: 0,
  };
  for (const row of contactCountRows) {
    if (contactStatuses.includes(row.status as ContactStatus)) {
      contactCounts[row.status as ContactStatus] = row.total;
    }
  }

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
        <nav className="panel-nav" aria-label="Secciones del panel de admin">
          <a className="button secondary" href="#metricas">
            Métricas
          </a>
          <a className="button secondary" href="#solicitudes">
            Solicitudes
            {newRequestCount > 0 ? ` (${newRequestCount} nuevas)` : ""}
          </a>
          <a className="button secondary" href="#contactos">
            Contactos
            {contactCounts.new > 0 ? ` (${contactCounts.new} nuevos)` : ""}
          </a>
          <a className="button secondary" href="#profesionales">
            Profesionales
          </a>
          <a className="button secondary" href="#alianzas">
            Alianzas
          </a>
          <Link className="button secondary" href="/admin/export">
            Exportar solicitudes CSV
          </Link>
        </nav>

        <h2 id="metricas">Métricas</h2>
        <MetricsDashboard />

        <h2 id="contactos">Contactos</h2>
        <p className="muted">
          Preguntas, ideas y avisos enviados desde la web y los paneles
          profesionales. Los mensajes nuevos aparecen primero.
        </p>
        <AdminContactInbox
          rows={contactRows}
          counts={contactCounts}
          statusFilter={contactStatusFilter as ContactStatus | ""}
          sourceFilter={contactSourceFilter as ContactSource | ""}
          categoryFilter={contactCategoryFilter as ContactCategory | ""}
          updateStatusAction={adminUpdateContactMessageStatus}
        />

        <h2 id="profesionales">Profesionales</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Estado</th>
                <th>Tipo</th>
                <th>Verificación</th>
                <th>Capacidad</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {proRows.map((professional) => (
                <tr key={professional.id}>
                  <td data-label="Nombre">
                    <strong>{professional.fullName}</strong>
                    <br />
                    <span className="muted">{professional.licenseCountry}</span>
                  </td>
                  <td data-label="Correo">{professional.email}</td>
                  <td data-label="Estado">{professional.status}</td>
                  <td data-label="Tipo">
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
                  <td data-label="Verificación">
                    <AdminFpvBadge
                      fpvVerified={professional.fpvVerified}
                      fpvNumber={professional.fpvNumber}
                      fpvSnapshot={professional.fpvSnapshot}
                      credentialConfirmed={professional.credentialConfirmed}
                      nonClinicalHelper={professional.nonClinicalHelper}
                    />
                    {/* Confirmación manual solo para clínicos SIN verificación
                        automática FPV (p. ej. España, México). */}
                    {!professional.nonClinicalHelper &&
                    !professional.fpvVerified ? (
                      <form
                        action={adminSetCredentialConfirmed}
                        style={{ marginTop: "6px" }}
                      >
                        <input
                          name="professionalId"
                          type="hidden"
                          value={professional.id}
                        />
                        <input
                          name="confirmed"
                          type="hidden"
                          value={
                            professional.credentialConfirmed ? "false" : "true"
                          }
                        />
                        <button className="button secondary" type="submit">
                          {professional.credentialConfirmed
                            ? "Marcar pendiente"
                            : "Confirmar credencial"}
                        </button>
                      </form>
                    ) : null}
                  </td>
                  <td data-label="Capacidad">
                    {professional.currentActiveRequests}/
                    {professional.maxActiveRequests}
                    <br />
                    {professional.acceptingRequests ? "Acepta" : "No acepta"}
                    <br />
                    <span className="muted">
                      {professional.remoteAvailable
                        ? "En el directorio"
                        : "Oculto"}
                    </span>{" "}
                    <form action={adminSetProfessionalVisibility}>
                      <input
                        name="professionalId"
                        type="hidden"
                        value={professional.id}
                      />
                      <input
                        name="visible"
                        type="hidden"
                        value={professional.remoteAvailable ? "false" : "true"}
                      />
                      <button className="button secondary" type="submit">
                        {professional.remoteAvailable ? "Ocultar" : "Mostrar"}
                      </button>
                    </form>
                  </td>
                  <td data-label="Acción">
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

        <h2 id="alianzas">Alianzas y organizaciones</h2>
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

        <h2 id="solicitudes">Solicitudes</h2>
        <p className="muted">
          Cada persona que pidió apoyo. La “distribución” muestra en cuántos
          paneles de profesionales está la solicitud, quién la tomó y cuántos la
          vieron pasar — así compruebas que les llega a los psicólogos.
        </p>
        <form action="/admin" className="admin-request-filters">
          <label>
            Estado
            <select name="estado" defaultValue={statusFilter}>
              <option value="">Todos</option>
              <option value="new">Nueva</option>
              <option value="contacted">Contactada</option>
              <option value="assigned">Asignada</option>
              <option value="closed">Cerrada</option>
            </select>
          </label>
          <label>
            Urgencia
            <select name="urgencia" defaultValue={urgencyFilter}>
              <option value="">Todas</option>
              {requestUrgencyOptions.map((option) => (
                <option key={option} value={option}>
                  {urgencyLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Buscar
            <input
              name="q"
              type="search"
              defaultValue={queryFilter}
              placeholder="Correo, ciudad, país o tipo de apoyo"
            />
          </label>
          <div className="admin-request-filter-actions">
            <button className="button" type="submit">
              Filtrar
            </button>
            <Link className="button secondary" href="/admin#solicitudes">
              Limpiar
            </Link>
          </div>
        </form>
        <div className="grid admin-request-list">
          {requestRows.map((request) => (
            <AdminRequestCard
              anonymizeAction={adminAnonymizeHelpRequest}
              assignAction={adminAssignRequest}
              distribution={distribution.get(request.id)}
              eligibleProfessionals={eligibleProfessionals}
              key={request.id}
              request={request}
              suggestions={suggestions.get(request.id) ?? []}
              updateStatusAction={adminUpdateHelpRequestStatus}
            />
          ))}
        </div>

        {requestRows.length === 0 ? (
          <p className="muted">No hay solicitudes en esta página.</p>
        ) : null}

        {hasPrevPage || hasNextPage ? (
          <nav className="pagination" aria-label="Paginación de solicitudes">
            {hasPrevPage ? (
              <Link className="button secondary" href={adminPageHref(page - 1)}>
                ← Anteriores
              </Link>
            ) : (
              <span />
            )}
            <span className="muted">Página {page}</span>
            {hasNextPage ? (
              <Link className="button secondary" href={adminPageHref(page + 1)}>
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
