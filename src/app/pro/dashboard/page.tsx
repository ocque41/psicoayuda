import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateProfessionalAvailability } from "@/app/actions";
import { acceptRequestOffer } from "@/app/actions-offers";
import { AccountActions } from "@/components/account-actions";
import { db } from "@/db";
import { assignments, helpRequests, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { languageLabels, needLabels, urgencyLabels } from "@/lib/constants";
import {
  conversationsForProfessional,
  pendingOffersForProfessional,
} from "@/lib/offers";

export const metadata: Metadata = {
  title: "Panel profesional",
  robots: { index: false, follow: false },
};

// Mensaje humano por estado de verificación: nunca mostramos el valor crudo de DB.
const verificationCopy: Record<string, { title: string; body: string }> = {
  pending_verification: {
    title: "Estamos verificando tu perfil",
    body: "Una persona del equipo revisará tu credencial y te avisaremos por correo en cuanto esté aprobado. No necesitas hacer nada más.",
  },
  rejected: {
    title: "Aún no pudimos verificar tu perfil",
    body: "Si crees que es un error o quieres añadir información, actualiza tus datos y lo revisamos de nuevo.",
  },
  suspended: {
    title: "Tu participación está en pausa",
    body: "Por ahora no estás recibiendo solicitudes. Si tienes dudas, actualiza tu perfil o escríbenos.",
  },
};

const requestStatusLabels: Record<string, string> = {
  new: "Nueva",
  contacted: "Contactada",
  assigned: "Asignada",
  closed: "Cerrada",
};

export default async function ProDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ oferta?: string }>;
}) {
  const { oferta } = await searchParams;
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/pro");

  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });

  if (!professional) {
    return (
      <section className="section">
        <div className="container">
          <p>
            <Link className="button secondary" href="/">
              ← Volver al inicio
            </Link>
          </p>
          <h1>Tu panel</h1>
          <p>Aún no completaste tu perfil. Es el paso para poder acompañar.</p>
          <Link className="button human" href="/pro/onboarding">
            Completar mi perfil
          </Link>
          <AccountActions />
        </div>
      </section>
    );
  }

  if (professional.status !== "approved") {
    const copy =
      verificationCopy[professional.status] ??
      verificationCopy.pending_verification;
    return (
      <section className="section">
        <div className="container">
          <p>
            <Link className="button secondary" href="/">
              ← Volver al inicio
            </Link>
          </p>
          <h1>Tu panel</h1>
          <div className="card">
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
            <Link className="button secondary" href="/pro/onboarding">
              Actualizar mi información
            </Link>
          </div>
          <AccountActions />
        </div>
      </section>
    );
  }

  const assigned = await db
    .select({
      request: helpRequests,
      assignment: assignments,
    })
    .from(assignments)
    .innerJoin(helpRequests, eq(assignments.helpRequestId, helpRequests.id))
    // El estado de la asignación es la frontera de autorización: solo se
    // muestran datos de contacto de solicitudes realmente asignadas a este pro.
    .where(
      and(
        eq(assignments.professionalId, professional.id),
        eq(assignments.status, "assigned"),
      ),
    );

  const offers = await pendingOffersForProfessional(professional.id);
  const chats = await conversationsForProfessional(professional.id);

  const nombrePanel =
    professional.displayName || professional.fullName.split(" ")[0] || "";

  return (
    <section className="section">
      <div className="container">
        <h1>{nombrePanel ? `Hola, ${nombrePanel}` : "Tu panel"}</h1>
        <div className="panel-chips">
          <span
            className={`panel-chip ${professional.remoteAvailable ? "ok" : "off"}`}
          >
            {professional.remoteAvailable
              ? "Visible en el directorio"
              : "Oculto del directorio"}
          </span>
          <span
            className={`panel-chip ${professional.acceptingRequests ? "ok" : "off"}`}
          >
            {professional.acceptingRequests
              ? "Recibiendo solicitudes"
              : "En pausa"}
          </span>
          <span className="panel-chip">
            {professional.currentActiveRequests}/
            {professional.maxActiveRequests} personas
          </span>
        </div>

        {/* Todas las secciones a un toque: nadie navega este panel a ciegas. */}
        <nav className="panel-nav" aria-label="Secciones de tu panel">
          <Link className="button secondary" href="/">
            ← Inicio
          </Link>
          <Link className="button secondary" href="/pro/onboarding">
            ✎ Editar mi información
          </Link>
          <a className="button secondary" href="#disponibilidad">
            Disponibilidad
          </a>
          <a className="button secondary" href="#bandeja">
            Solicitudes
          </a>
          <a className="button secondary" href="#chats">
            Chats
          </a>
          <a className="button secondary" href="#personas">
            Personas
          </a>
          <a className="button secondary" href="#cuenta">
            Mi cuenta
          </a>
        </nav>

        <h2 id="disponibilidad">Tu disponibilidad</h2>
        <div className="card">
          <p>
            Estás acompañando a{" "}
            <strong>{professional.currentActiveRequests}</strong> de{" "}
            <strong>{professional.maxActiveRequests}</strong> personas.
          </p>
          <form action={updateProfessionalAvailability}>
            <div className="checks">
              <label>
                <input
                  name="acceptingRequests"
                  type="checkbox"
                  defaultChecked={professional.acceptingRequests}
                />
                Quiero recibir nuevas solicitudes
              </label>
            </div>
            <p className="hint">
              Desactívalo cuando necesites una pausa; no perderás los casos que
              ya tienes.
            </p>
            <button className="button secondary" type="submit">
              Guardar
            </button>
          </form>
        </div>

        {oferta ? (
          <p className="form-error" role="alert">
            {oferta === "cupo"
              ? "Llegaste a tu cupo de personas. Libera un caso o súbelo en tu perfil para aceptar más."
              : "Esa solicitud ya no está disponible (otra persona la tomó primero)."}
          </p>
        ) : null}

        <h2 id="bandeja">Solicitudes para ti</h2>
        <p className="muted">
          Personas que pidieron apoyo y te lo enviaron. Solo ves el tipo de
          apoyo y la urgencia; al aceptar se abre el chat y recibes su contacto.
        </p>
        {offers.length > 0 ? (
          <ul className="offer-list">
            {offers.map((o) => (
              <li key={o.assignmentId} className="card">
                <p style={{ margin: "0 0 8px" }}>
                  <strong>
                    {needLabels[o.needCategory as keyof typeof needLabels] ??
                      o.needCategory}
                  </strong>{" "}
                  ·{" "}
                  {urgencyLabels[o.urgency as keyof typeof urgencyLabels] ??
                    o.urgency}
                  {o.language
                    ? ` · ${languageLabels[o.language as keyof typeof languageLabels] ?? o.language}`
                    : ""}
                  {o.state ? ` · ${o.state}` : ""}
                </p>
                <form action={acceptRequestOffer}>
                  <input
                    type="hidden"
                    name="assignmentId"
                    value={o.assignmentId}
                  />
                  <button type="submit" className="button human">
                    Aceptar y abrir chat
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No tienes solicitudes nuevas por ahora.</p>
        )}

        <h2 id="chats">Tus conversaciones</h2>
        {chats.length > 0 ? (
          <ul className="offer-list">
            {chats.map((c) => (
              <li key={c.conversationId} className="card">
                <p style={{ margin: "0 0 8px" }}>
                  <strong>
                    {needLabels[c.needCategory as keyof typeof needLabels] ??
                      c.needCategory ??
                      "Conversación"}
                  </strong>
                  {c.urgency
                    ? ` · ${urgencyLabels[c.urgency as keyof typeof urgencyLabels] ?? c.urgency}`
                    : ""}
                  {c.status !== "open" ? " · cerrada" : ""}
                </p>
                <Link className="button human" href={`/c/${c.conversationId}`}>
                  Abrir chat
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            Aún no tienes conversaciones abiertas. Cuando alguien te escriba o
            aceptes una solicitud, aparecerán aquí.
          </p>
        )}

        <h2 id="personas">Personas que acompañas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Contacto</th>
                <th>Zona</th>
                <th>Necesita</th>
                <th>Cómo lo siente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map(({ request, assignment }) => (
                <tr key={assignment.id}>
                  <td>{request.email}</td>
                  <td>{request.city || "No indicada"}</td>
                  <td>
                    {needLabels[
                      request.needCategory as keyof typeof needLabels
                    ] ?? request.needCategory}
                  </td>
                  <td>
                    {urgencyLabels[
                      request.urgency as keyof typeof urgencyLabels
                    ] ?? request.urgency}
                  </td>
                  <td>
                    {requestStatusLabels[request.status] ?? request.status}
                  </td>
                </tr>
              ))}
              {assigned.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    Todavía no tienes personas asignadas. Te avisaremos cuando
                    haya alguien a quien puedas acompañar.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <h2 id="cuenta">Tu cuenta</h2>
        <AccountActions />
      </div>
    </section>
  );
}
