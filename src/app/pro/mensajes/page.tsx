import type { Metadata } from "next";
import Link from "next/link";
import {
  createPatient,
  releaseConversationQuota,
} from "@/app/pro/consulta/actions";
import { PracticeForm, TimeZoneSelect } from "@/components/practice/forms";
import { InboxNotifier } from "@/components/practice/inbox-notifier";
import { PracticeNav } from "@/components/practice/nav";
import { PracticePagination } from "@/components/practice/pagination";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { messageListHref } from "@/lib/practice/navigation";
import { chatList, inboxSummary } from "@/lib/practice/queries";

export const metadata: Metadata = {
  title: "Mensajes · Tu consulta",
  robots: { index: false, follow: false },
};

export default async function PracticeMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string; chats?: string }>;
}) {
  const pro = await requirePracticeProfessional();
  const params = await searchParams;
  const [chats, inbox] = await Promise.all([
    chatList(pro.id, params.pagina || params.chats),
    inboxSummary(pro.id),
  ]);
  return (
    <section className="section">
      <div className="container practice-shell">
        <p className="eyebrow">Nido · Tu consulta</p>
        <h1>Tus conversaciones</h1>
        <p className="lead">
          Retoma cada hilo y conecta sus encuentros con una ficha.
        </p>
        <PracticeNav />
        <InboxNotifier initial={inbox} />
        <section
          className="workspace-card"
          aria-labelledby="messages-list-title"
        >
          <div className="panel-nav">
            <h2 id="messages-list-title">Mensajes y cupos</h2>
            <Link href="/pro/pacientes" className="button secondary">
              Ver pacientes →
            </Link>
          </div>
          <p className="hint">
            Un contacto sin respuesta no tiene que bloquear tu capacidad. Puedes
            liberar su cupo conservando la conversación.
          </p>
          <div className="grid grid-2">
            {chats.rows.map((chat) => (
              <article className="card" key={chat.id}>
                <h3>{chat.name || "Persona sin alias"}</h3>
                <Link className="button secondary" href={`/c/${chat.id}`}>
                  Abrir chat
                </Link>
                {chat.patientId ? (
                  <p>
                    <Link href={`/pro/pacientes/${chat.patientId}`}>
                      Abrir su ficha de paciente →
                    </Link>
                  </p>
                ) : (
                  <details>
                    <summary>Vincular a una ficha</summary>
                    <PracticeForm
                      action={createPatient}
                      submit="Crear ficha vinculada"
                      resetOnSuccess
                    >
                      <input
                        type="hidden"
                        name="conversationId"
                        value={chat.id}
                      />
                      <input
                        type="hidden"
                        name="program"
                        value={chat.helpRequestId ? "earthquake" : "general"}
                      />
                      <label>
                        Nombre o alias
                        <input
                          name="name"
                          defaultValue={chat.name || ""}
                          required
                          maxLength={80}
                        />
                      </label>
                      <label>
                        Correo
                        <input
                          name="email"
                          type="email"
                          defaultValue={chat.email || ""}
                          maxLength={254}
                        />
                      </label>
                      <label>
                        País donde recibe atención
                        <input
                          name="country"
                          defaultValue="Venezuela"
                          required
                          maxLength={80}
                        />
                      </label>
                      <TimeZoneSelect />
                      <label className="practice-check">
                        <input type="checkbox" name="consent" required />
                        Tengo autorización para crear la ficha.
                      </label>
                    </PracticeForm>
                  </details>
                )}
                {chat.quotaReleasedAt ? (
                  <p className="hint">Este chat ya no ocupa cupo.</p>
                ) : (
                  <PracticeForm
                    action={releaseConversationQuota}
                    submit="Liberar cupo sin borrar chat"
                  >
                    <input
                      type="hidden"
                      name="conversationId"
                      value={chat.id}
                    />
                  </PracticeForm>
                )}
              </article>
            ))}
          </div>
          {!chats.rows.length ? (
            <div className="workspace-empty">
              <h3>Un lugar para retomar cada conversación.</h3>
              <p className="hint">
                Tus conversaciones aparecerán aquí cuando una persona contacte
                contigo.
              </p>
            </div>
          ) : null}
          <PracticePagination
            page={chats.page}
            pages={chats.pages}
            total={chats.total}
            href={messageListHref}
            prefetch={false}
          />
        </section>
      </div>
    </section>
  );
}
