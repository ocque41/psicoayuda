import Link from "next/link";
import { PracticeForm } from "@/components/practice/forms";
import { PracticePagination } from "@/components/practice/pagination";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import { patientChats } from "@/lib/patient/queries";
import { dateLabel } from "@/lib/practice/domain";
import { connectExistingChats } from "../actions";
import styles from "../mi.module.css";
export default async function PatientMessages({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { account } = await requirePatientAccount();
  const params = await searchParams,
    chats = await patientChats(account.userId, params.pagina);
  return (
    <WorkspaceShell
      audience="patient"
      title="Conversaciones que acompañan"
      description="Retoma el hilo con tus profesionales. Los mensajes mantienen el cifrado del chat."
      actions={
        <Link href="/profesionales" className="button human">
          Nuevo profesional ↗
        </Link>
      }
    >
      <section className="workspace-card">
        {chats.rows.length ? (
          chats.rows.map((c) => (
            <article className={styles.row} key={c.id}>
              <div className={styles.inline}>
                <span className={styles.icon} aria-hidden="true">
                  ↗
                </span>
                <div className={styles.rowMain}>
                  <h2>{c.name}</h2>
                  <p className="hint">
                    {c.lastMessageRole === "professional" &&
                    c.lastMessageAt &&
                    (!c.lastReadAt || c.lastMessageAt > c.lastReadAt) ? (
                      <>
                        <span className={styles.unread} aria-hidden="true" />
                        Nueva respuesta ·{" "}
                      </>
                    ) : null}
                    {c.status === "open" ? "Abierta" : "Cerrada"}
                    {c.lastMessageAt
                      ? ` · ${dateLabel(c.lastMessageAt.toISOString(), account.timezone)}`
                      : " · El primer mensaje puede ser sencillo"}
                    {c.program === "earthquake"
                      ? " · Ayuda Terremoto · gratuita"
                      : ""}
                  </p>
                </div>
              </div>
              <Link
                className="button secondary"
                prefetch={false}
                href={`/mi/mensajes/${c.id}`}
              >
                Abrir conversación →
              </Link>
            </article>
          ))
        ) : (
          <div className="workspace-empty">
            <h2>Tu primera conversación empieza aquí</h2>
            <p>
              Elige un profesional o conecta una conversación que ya tengas. No
              necesitas contar tu historia para organizar tu espacio.
            </p>
            <Link href="/profesionales" className="button human">
              Explorar profesionales
            </Link>
          </div>
        )}
        <PracticePagination
          {...chats}
          href={(page) => `/mi/mensajes?pagina=${page}`}
        />
      </section>
      <section className="workspace-card">
        <h2>¿Ya tienes conversaciones?</h2>
        <p>
          Las conectamos solo si verificamos que te pertenecen: con el correo
          verificado de tu cuenta o con el acceso vigente del chat en este
          navegador.
        </p>
        <PracticeForm
          action={connectExistingChats}
          submit="Conectar mis conversaciones"
        >
          <p className="hint">
            Si usaste otro correo, abre primero el enlace que recibiste. No se
            muestran mensajes ni datos de otras personas.
          </p>
        </PracticeForm>
      </section>
    </WorkspaceShell>
  );
}
