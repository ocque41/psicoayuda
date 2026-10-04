import Link from "next/link";
import { PracticeForm } from "@/components/practice/forms";
import { PracticePagination } from "@/components/practice/pagination";
import { WorkspaceShell } from "@/components/workspace/shell";
import { requirePatientAccount } from "@/lib/patient/access";
import { requestPatientSession } from "../actions";
import { patientSessionOptions } from "./options";
export default async function NewPatientSession({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string }>;
}) {
  const { account } = await requirePatientAccount(),
    params = await searchParams,
    chats = await patientSessionOptions(account.userId, params.pagina);
  const available = chats.rows;
  return (
    <WorkspaceShell
      audience="patient"
      title="Haz espacio para ti"
      description="Propón un horario a un profesional con quien ya conversas. La sesión queda confirmada cuando lo acuerden."
      actions={
        <Link href="/profesionales" className="button secondary">
          Elegir otro profesional ↗
        </Link>
      }
    >
      <div className="workspace-grid">
        <section className="workspace-card">
          <h2>Tu próxima sesión</h2>
          {available.length ? (
            <PracticeForm
              action={requestPatientSession}
              submit="Enviar propuesta"
              resetOnSuccess
            >
              <input type="hidden" name="kind" value="new" />
              <label>
                Con quién
                <select name="conversationId" required>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.program === "earthquake"
                        ? " · Ayuda Terremoto · gratuita"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Horario que te vendría bien · {account.timezone}
                <input name="preferredLocal" type="datetime-local" required />
              </label>
              <p className="hint">
                No es una reserva automática. Confirma duración, modalidad y
                condiciones con el profesional. Ayuda Terremoto permanece
                gratuita.
              </p>
            </PracticeForm>
          ) : (
            <div className="workspace-empty">
              <p>
                Necesitas una conversación abierta con un profesional aprobado
                para proponer una sesión. Tus conversaciones anteriores siguen
                disponibles en Mensajes.
              </p>
              <div className="panel-nav">
                <Link className="button human" href="/profesionales">
                  Encontrar profesional
                </Link>
                <Link className="button secondary" href="/mi/mensajes">
                  Conectar un chat existente
                </Link>
              </div>
            </div>
          )}
          <PracticePagination
            {...chats}
            href={(page) => `/mi/nueva-sesion?pagina=${page}`}
          />
        </section>
        <aside className="workspace-card">
          <p className="eyebrow">Sin prisas</p>
          <h2>Antes de la sesión</h2>
          <p>
            Habla de la disponibilidad, el país desde el que recibirás atención
            y lo que necesitas. El profesional debe confirmar que puede
            atenderte en ese país.
          </p>
          <p>
            Cuando confirme la sesión, aparecerá en tu calendario. Puedes
            proponer cambios desde allí.
          </p>
          <Link href="/mi/calendario" className="link-arrow">
            Volver a mi calendario →
          </Link>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
