import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateProfessionalAvailability } from "@/app/actions";
import { db } from "@/db";
import { assignments, helpRequests, professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";

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
          <h1>Dashboard profesional</h1>
          <p>Aún no completaste el onboarding.</p>
          <Link className="button" href="/pro/onboarding">
            Completar onboarding
          </Link>
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
    .where(eq(assignments.professionalId, professional.id));

  return (
    <section className="section">
      <div className="container">
        <h1>Dashboard profesional</h1>
        <div className="card">
          <p>
            Estado de verificación: <strong>{professional.status}</strong>
          </p>
          <p>
            Solicitudes activas: {professional.currentActiveRequests} /{" "}
            {professional.maxActiveRequests}
          </p>
          <form action={updateProfessionalAvailability}>
            <label>
              <input
                name="acceptingRequests"
                type="checkbox"
                defaultChecked={professional.acceptingRequests}
              />{" "}
              Aceptando solicitudes
            </label>{" "}
            <button className="button secondary" type="submit">
              Guardar
            </button>
          </form>
        </div>

        <h2>Solicitudes asignadas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Ciudad</th>
                <th>Urgencia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map(({ request, assignment }) => (
                <tr key={assignment.id}>
                  <td>{request.email}</td>
                  <td>{request.city || "No indicada"}</td>
                  <td>{request.urgency}</td>
                  <td>{request.status}</td>
                </tr>
              ))}
              {assigned.length === 0 ? (
                <tr>
                  <td colSpan={4}>No hay solicitudes asignadas.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
