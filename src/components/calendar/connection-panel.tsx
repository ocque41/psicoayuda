import { and, eq } from "drizzle-orm";
import {
  connectCalendar,
  disconnectCalendar,
  saveGoogleReminders,
  synchronizeCalendar,
} from "@/app/calendar-actions";
import { PracticeForm } from "@/components/practice/forms";
import { db } from "@/db";
import { googleCalendarConnections } from "@/db/calendar-schema";
import {
  type CalendarAudience,
  loadCalendarActor,
} from "@/lib/calendar/access";
import { googleCalendarConfig } from "@/lib/calendar/config";
import styles from "./connection-panel.module.css";

const feedbackMessages: Record<string, string> = {
  denied: "No concediste el permiso a Google. Tu agenda de Nido no cambió.",
  state:
    "El enlace de conexión caducó o ya se usó. Inicia la conexión otra vez desde tu cuenta.",
  permission:
    "Verifica tu correo y los permisos de tu espacio antes de conectar el calendario.",
  error:
    "Google no completó la conexión. Puedes reintentar o descargar la agenda.",
};
export async function CalendarConnectionPanel({
  userId,
  audience,
  feedback,
}: {
  userId: string;
  audience: CalendarAudience;
  feedback?: string;
}) {
  const [connection, actor] = await Promise.all([
    db.query.googleCalendarConnections.findFirst({
      where: and(
        eq(googleCalendarConnections.userId, userId),
        eq(googleCalendarConnections.audience, audience),
      ),
      columns: {
        status: true,
        calendarId: true,
        googleReminders: true,
        autoSync: true,
        preferencesRevision: true,
        syncCursor: true,
        lastSyncedAt: true,
        errorCode: true,
      },
    }),
    loadCalendarActor(userId, audience),
  ]);
  const configured = Boolean(googleCalendarConfig()),
    connected = connection?.status === "connected";
  const ready = configured && Boolean(actor);
  return (
    <section
      className={`workspace-card ${styles.panel}`}
      aria-labelledby={`calendar-title-${audience}`}
    >
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <title>Calendario</title>
            <rect x="4" y="5" width="16" height="16" rx="4" />
            <path d="M8 3v5M16 3v5M4 11h16M8 15h3M8 18h7" />
          </svg>
        </span>
        <div>
          <p className="eyebrow">Tu agenda, donde te resulte más cómodo</p>
          <h2 id={`calendar-title-${audience}`}>Google Calendar</h2>
        </div>
        <span className={styles.status}>
          {connected
            ? connection.calendarId
              ? "Conectado"
              : "Permiso concedido"
            : connection
              ? "Requiere atención"
              : "Sin conectar"}
        </span>
      </div>
      <p>
        Copia los horarios de las sesiones de los próximos 365 días a un
        calendario Nido en Google. Una sesión reprogramada fuera de ese periodo
        se retira de esta copia. Los cambios de sesiones se hacen en Nido;
        editar Google no cambia ni reserva sesiones aquí.
      </p>
      <p className="hint">
        Google recibe el título «Sesión Nido» y su horario. No enviamos nombres,
        correos, fichas, notas ni mensajes. Google permite crear calendarios
        secundarios y gestionar los eventos de los calendarios creados por la
        aplicación. Nido solo utiliza el calendario asociado a este espacio.
      </p>
      {feedback && feedbackMessages[feedback] ? (
        <p className="status-message" role="status">
          {feedbackMessages[feedback]}
        </p>
      ) : null}
      {connection?.errorCode ? (
        <p className="form-error" role="status">
          {connection.errorCode === "reconnect"
            ? "Google retiró el permiso o el calendario ya no está disponible. Desconecta esta conexión y vuelve a autorizarla."
            : connection.errorCode === "permission"
              ? "Las actualizaciones se pausaron porque cambió el acceso a tu cuenta. Revisa tus permisos antes de continuar."
              : "La última sincronización quedó pendiente. Reintenta: las sesiones de Nido se conservan."}
        </p>
      ) : null}
      {connection?.lastSyncedAt ? (
        <p className="hint">
          Última sincronización completa:{" "}
          <time dateTime={connection.lastSyncedAt}>
            {new Intl.DateTimeFormat("es", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: actor?.timeZone || "UTC",
            }).format(new Date(connection.lastSyncedAt))}{" "}
            · {actor?.timeZone || "UTC"}
          </time>
        </p>
      ) : null}
      {!configured ? (
        <p className="hint" id={`calendar-setup-${audience}`}>
          La conexión directa aún está en preparación. Puedes descargar tu
          agenda e importarla en Google Calendar desde ahora.
        </p>
      ) : !actor ? (
        <p className="hint" id={`calendar-setup-${audience}`}>
          Verifica tu correo y entra en tu espacio para conectar o descargar la
          agenda.
        </p>
      ) : null}
      {!connection ? (
        ready ? (
          <PracticeForm
            action={connectCalendar}
            submit="Conectar con Google Calendar"
          >
            <input type="hidden" name="espacio" value={audience} />
            <label className="practice-check">
              <input type="checkbox" name="consent" required />
              Quiero copiar mis horarios de sesiones a Google con el permiso
              descrito arriba.
            </label>
          </PracticeForm>
        ) : (
          <button
            type="button"
            className="button secondary"
            disabled
            aria-describedby={`calendar-setup-${audience}`}
          >
            Conectar con Google Calendar
          </button>
        )
      ) : null}
      {connected && ready ? (
        <>
          <PracticeForm
            action={synchronizeCalendar}
            submit={
              connection.syncCursor
                ? "Continuar sincronización"
                : "Sincronizar ahora"
            }
          >
            <input type="hidden" name="espacio" value={audience} />
          </PracticeForm>
          <PracticeForm
            action={saveGoogleReminders}
            submit="Guardar preferencias de Google"
          >
            <input type="hidden" name="espacio" value={audience} />
            <input
              type="hidden"
              name="revision"
              value={connection.preferencesRevision}
            />
            <div
              key={`google-preferences-${connection.preferencesRevision}-${connection.autoSync}-${connection.googleReminders}`}
            >
              <label className="practice-check">
                <input
                  type="checkbox"
                  name="autoSync"
                  defaultChecked={connection.autoSync}
                />
                Actualizar Google periódicamente cuando cree, cambie o cancele
                sesiones en Nido.
              </label>
              <label className="practice-check">
                <input
                  type="checkbox"
                  name="googleReminders"
                  defaultChecked={connection.googleReminders}
                />
                Usar los avisos que configure en el calendario Nido de Google.
              </label>
            </div>
            <p className="hint">
              La actualización es periódica y puede tardar más según la cantidad
              de agendas pendientes. Usa Sincronizar ahora si necesitas aplicar
              un cambio inmediatamente. Los avisos de Google y los correos de
              Nido se eligen por separado; los avisos de Google empiezan
              desactivados.
            </p>
          </PracticeForm>
          {!connection.autoSync ? (
            <p className="hint">
              Con las actualizaciones automáticas desactivadas, pulsa
              Sincronizar ahora después de crear, cambiar o cancelar una sesión.
            </p>
          ) : null}
          <a
            href="https://calendar.google.com/calendar/u/0/r"
            target="_blank"
            rel="noopener noreferrer"
            className="link-arrow"
          >
            Abrir Google Calendar ↗
          </a>
        </>
      ) : null}
      {connection ? (
        <details className={styles.disconnect}>
          <summary>Desconectar Google Calendar</summary>
          <p className="hint">
            Se retira el permiso de Calendar de tu cuenta Nido y se detienen las
            actualizaciones de tus espacios. Los eventos copiados permanecen en
            Google; puedes borrar su calendario Nido allí. Esta conexión es
            independiente del acceso a Nido con Google.
          </p>
          <PracticeForm
            action={disconnectCalendar}
            submit={
              connection.status === "disconnecting"
                ? "Completar desconexión"
                : "Desconectar de mi cuenta"
            }
          />
        </details>
      ) : null}
      <div className={styles.export}>
        <h3>También puedes llevar tu agenda con un archivo</h3>
        <p className="hint">
          Descarga las próximas sesiones de los siguientes doce meses, hasta 500
          eventos, sin nombres ni notas. Es una copia: no se actualiza sola y no
          retira eventos cancelados que hayas importado antes.
        </p>
        {actor ? (
          <a
            href={`/api/calendar/export?espacio=${audience}`}
            className="button secondary"
            download="nido-agenda.ics"
          >
            Descargar agenda .ics
          </a>
        ) : (
          <button type="button" className="button secondary" disabled>
            Descargar agenda .ics
          </button>
        )}
        <details>
          <summary>Cómo importarla en Google Calendar</summary>
          <ol>
            <li>
              En Google Calendar desde un ordenador, crea un calendario llamado
              Nido.
            </li>
            <li>Abre Configuración → Importar y exportar.</li>
            <li>Elige el archivo nido-agenda.ics y el calendario Nido.</li>
            <li>
              Configura sus avisos en Google. Para retirar una sesión cancelada
              de esta copia, elimínala también allí.
            </li>
          </ol>
        </details>
      </div>
    </section>
  );
}
