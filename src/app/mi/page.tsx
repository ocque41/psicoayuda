import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import {
  patientAppointments,
  patientChats,
  patientRequestCounts,
  patientRequests,
} from "@/lib/patient/queries";
import styles from "./mi.module.css";
import { AppointmentList, RequestList } from "./patient-parts";
export default async function PatientHome() {
  const { account } = await requirePatientAccount();
  const [appointments, chats, requests, requestCounts] = await Promise.all([
    patientAppointments(account.userId, { upcoming: true }),
    patientChats(account.userId),
    patientRequests(account.userId),
    patientRequestCounts(account.userId),
  ]);
  return (
    <WorkspaceShell
      audience="patient"
      eyebrow="Un espacio para cuidarte"
      title={`Hola, ${account.displayName}`}
      description="Tus conversaciones, tus próximos pasos y tu tiempo, en un mismo lugar."
      actions={
        <Link href="/mi/nueva-sesion" className="button human">
          Nueva sesión <span aria-hidden="true">↗</span>
        </Link>
      }
    >
      <div className="workspace-metrics">
        <div className="workspace-card">
          <p className="hint">Por delante</p>
          <strong className="stat-value">{appointments.total}</strong>
          <p>Sesiones confirmadas</p>
        </div>
        <div className="workspace-card">
          <p className="hint">Tus vínculos</p>
          <strong className="stat-value">{chats.total}</strong>
          <p>Conversaciones</p>
        </div>
        <div className="workspace-card">
          <p className="hint">En coordinación</p>
          <strong className="stat-value">{requestCounts.pending}</strong>
          <p>Solicitudes pendientes</p>
        </div>
      </div>
      <div className="workspace-grid">
        <section className="workspace-card">
          <div className="panel-nav">
            <h2>Lo que viene</h2>
            <Link href="/mi/calendario" className="link-arrow">
              Ver calendario →
            </Link>
          </div>
          <p className="hint">
            Horario en {account.timezone.replaceAll("_", " ")}
          </p>
          <AppointmentList
            rows={appointments.rows.slice(0, 3)}
            timezone={account.timezone}
          />
        </section>
        <aside className={styles.heroCard}>
          <p className="eyebrow">A tu ritmo</p>
          <h2>El siguiente paso puede ser pequeño.</h2>
          <p>
            Encuentra a alguien con quien hablar o vuelve a una conversación que
            ya empezó.
          </p>
          <div className="panel-nav">
            <Link className="button human" href="/profesionales">
              Encontrar profesional ↗
            </Link>
            <Link className="button secondary" href="/orientacion">
              Ayúdame a elegir
            </Link>
          </div>
        </aside>
      </div>
      {requests.length ? (
        <section className="workspace-card">
          <h2>Tus solicitudes</h2>
          <p className="hint">
            El profesional confirma cualquier cambio contigo. Una solicitud no
            modifica una sesión ni acredita un pago.
          </p>
          <RequestList
            rows={requests.slice(0, 5)}
            timezone={account.timezone}
          />
          <Link href="/mi/calendario" className="link-arrow">
            Ver todas →
          </Link>
        </section>
      ) : null}
      <section className="workspace-card">
        <div className="panel-nav">
          <h2>Un lugar para retomar</h2>
          <Link className="link-arrow" href="/mi/mensajes">
            Tus mensajes →
          </Link>
        </div>
        {chats.rows.length ? (
          chats.rows.slice(0, 3).map((c) => (
            <article className={styles.row} key={c.id}>
              <div className={styles.inline}>
                <span className={styles.icon} aria-hidden="true">
                  ↗
                </span>
                <div className={styles.rowMain}>
                  <h3>{c.name}</h3>
                  <p className="hint">
                    {c.status === "open"
                      ? "Conversación abierta"
                      : "Conversación cerrada"}
                    {c.program === "earthquake" ? " · Ayuda Terremoto" : ""}
                  </p>
                </div>
              </div>
              <Link
                className="button secondary"
                prefetch={false}
                href={`/mi/mensajes/${c.id}`}
              >
                Continuar
              </Link>
            </article>
          ))
        ) : (
          <div className="workspace-empty">
            <p>
              ¿Ya hablaste con alguien en Nido? Puedes conectar las
              conversaciones que abriste con tu correo o desde este navegador.
            </p>
            <Link href="/mi/mensajes" className="button secondary">
              Conectar mis conversaciones
            </Link>
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
