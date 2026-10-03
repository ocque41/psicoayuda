import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  joinSession,
  saveCallConsent,
} from "@/app/sesion/[appointmentId]/actions";
import { PracticeForm } from "@/components/practice/forms";
import { db } from "@/db";
import { callConsents } from "@/db/schema";
import {
  appointmentActor,
  callsConfigured,
  captureConfigured,
} from "@/lib/practice/calls";
import { appointmentStateLabels, dateLabel } from "@/lib/practice/domain";
import { filesForAppointment } from "@/lib/practice/media";
export const metadata: Metadata = {
  title: "Tu sesión",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function SessionPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;
  const actor = await appointmentActor(appointmentId);
  if (!actor) notFound();
  const consents = await db
    .select()
    .from(callConsents)
    .where(eq(callConsents.appointmentId, appointmentId));
  const own = consents.find((c) => c.role === actor.role);
  let files: Awaited<ReturnType<typeof filesForAppointment>> = [];
  let filesError = false;
  try {
    files = await filesForAppointment(appointmentId);
  } catch {
    filesError = true;
  }
  return (
    <section className="section">
      <div className="container orientation-chat">
        <h1>Tu sesión</h1>
        <p>
          {dateLabel(
            actor.appointment.startsAt,
            actor.role === "seeker"
              ? actor.patient.timeZone
              : actor.appointment.timeZone,
          )}
        </p>
        <p>Estado: {appointmentStateLabels[actor.appointment.status]}</p>
        <div className="card">
          <h2>Un espacio para conversar</h2>
          {callsConfigured() && actor.appointment.status === "scheduled" ? (
            <p>
              Puedes entrar 15 minutos antes. Usa auriculares y un lugar donde
              puedas hablar con privacidad. Si tu conexión es débil, puedes
              apagar el vídeo desde la llamada.
            </p>
          ) : null}
          {callsConfigured() && actor.appointment.status === "scheduled" ? (
            <PracticeForm action={joinSession} submit="Entrar a la llamada">
              <input type="hidden" name="appointmentId" value={appointmentId} />
            </PracticeForm>
          ) : (
            <p>
              {actor.appointment.status !== "scheduled"
                ? "Esta sesión conserva su historial. Puedes revisar el encuentro en tu agenda y continuar la conversación desde el chat."
                : "Las llamadas integradas todavía no están habilitadas. Acuerda el encuentro con tu profesional en el chat."}
            </p>
          )}
        </div>
        {captureConfigured() ? (
          <div className="card">
            <h2>Tú decides qué se guarda</h2>
            <p>
              La grabación y la transcripción son opcionales y necesitan el
              permiso de ambos para esta sesión. Puedes tener la consulta sin
              aceptar ninguna.
            </p>
            <p>
              <a
                href={process.env.NIDO_CALL_CAPTURE_POLICY_URL}
                target="_blank"
                rel="noreferrer"
              >
                Consultar quién accede, dónde se guarda y cuándo se elimina
              </a>
            </p>
            <PracticeForm
              action={saveCallConsent}
              submit="Guardar mis preferencias"
            >
              <input type="hidden" name="appointmentId" value={appointmentId} />
              <label className="practice-check">
                <input
                  type="checkbox"
                  name="recording"
                  defaultChecked={own?.recording || false}
                />
                Autorizo que se grabe esta sesión.
              </label>
              <label className="practice-check">
                <input
                  type="checkbox"
                  name="transcription"
                  defaultChecked={own?.transcription || false}
                />
                Autorizo la transcripción de esta sesión.
              </label>
            </PracticeForm>
            <p className="hint">
              Cambiar o retirar estos permisos detiene la sala abierta. Entra de
              nuevo para continuar con las nuevas preferencias.
            </p>
          </div>
        ) : (
          <p className="hint">
            Grabación y transcripción desactivadas. Esta llamada se abre sin
            guardarlas.
          </p>
        )}
        <section>
          <h2>Archivos de esta sesión</h2>
          <p className="hint">
            Las transcripciones pueden contener errores; revísalas antes de
            usarlas. Los archivos se conservan como máximo 30 días tras la
            sesión, según la política acordada.
          </p>
          {files.map((f) => (
            <p key={f.id}>
              {f.ready ? (
                <a
                  href={`/sesion/${appointmentId}/archivos/${f.type}/${f.id}`}
                  rel="noreferrer"
                >
                  {f.type === "recording"
                    ? "Abrir grabación"
                    : "Abrir transcripción"}
                </a>
              ) : (
                "Archivo en preparación"
              )}
            </p>
          ))}
          {filesError ? (
            <p>No pudimos consultar los archivos. Vuelve a intentarlo.</p>
          ) : !files.length ? (
            <p>No hay archivos disponibles.</p>
          ) : null}
        </section>
        {actor.patient.conversationId ? (
          <Link href={`/c/${actor.patient.conversationId}`}>
            Volver al chat
          </Link>
        ) : (
          <Link href="/pro/consulta">Volver a mi consulta</Link>
        )}
      </div>
    </section>
  );
}
