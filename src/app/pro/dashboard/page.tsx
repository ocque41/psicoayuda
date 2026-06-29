import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateProfessionalAvailability } from "@/app/actions";
import { db } from "@/db";
import { assignments, helpRequests, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { needLabels, urgencyLabels } from "@/lib/constants";

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

export default async function ProDashboardPage() {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/pro");

  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });

  if (!professional) {
    return (
      <section className="section">
        <div className="container">
          <h1>Tu panel</h1>
          <p>Aún no completaste tu perfil. Es el paso para poder acompañar.</p>
          <Link className="button human" href="/pro/onboarding">
            Completar mi perfil
          </Link>
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
          <h1>Tu panel</h1>
          <div className="card">
            <h2>{copy.title}</h2>
            <p>{copy.body}</p>
            <Link className="button secondary" href="/pro/onboarding">
              Actualizar mi perfil
            </Link>
          </div>
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

  return (
    <section className="section">
      <div className="container">
        <h1>Listo. Ya eres parte de la red.</h1>
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

        <h2>Personas que acompañas</h2>
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
      </div>
    </section>
  );
}
