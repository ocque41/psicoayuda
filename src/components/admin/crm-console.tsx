import Link from "next/link";
import styles from "./crm-console.module.css";

export const consoleAreas = [
  { id: "resumen", label: "Resumen" },
  { id: "practica", label: "Consulta" },
  { id: "calendario", label: "Google Calendar" },
  { id: "avisos", label: "Avisos" },
  { id: "facturacion", label: "Facturación" },
  { id: "llamadas", label: "Llamadas" },
] as const;
export type ConsoleArea = (typeof consoleAreas)[number]["id"];
export function resolveConsoleArea(
  raw: string | string[] | undefined,
): ConsoleArea {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return consoleAreas.find((area) => area.id === value)?.id || "resumen";
}

export type CrmConsoleSnapshot = {
  practiceEnabled: boolean;
  calendarEnabled: boolean;
  calendarConfigured: boolean;
  calendarClientPresent: boolean;
  calendarSecretPresent: boolean;
  calendarCallbackPresent: boolean;
  calendarKeyValid: boolean;
  emailConfigured: boolean;
  emailKeyPresent: boolean;
  emailSenderPresent: boolean;
  membershipEnabled: boolean;
  membershipConfigured: boolean;
  careEnabled: boolean;
  careConfigured: boolean;
  stripeKeyPresent: boolean;
  stripeWebhookPresent: boolean;
  callsConfigured: boolean;
  captureEnabled: boolean;
  captureConfigured: boolean;
  capturePolicyPresent: boolean;
};
export type CrmConsoleEvidence = {
  calendarConnection?: boolean;
  emailAccepted?: boolean;
  connectReady?: boolean;
  membershipRecorded?: boolean;
  unavailable?: boolean;
};
type Status = "enabled" | "disabled" | "incomplete";
function state(enabled: boolean, configured: boolean): Status {
  return !enabled ? "disabled" : configured ? "enabled" : "incomplete";
}
function StatusLabel({ value }: { value: Status }) {
  return (
    <span className={`${styles.status} ${styles[value]}`}>
      {
        {
          enabled: "Disponible en la aplicación",
          disabled: "Desactivado",
          incomplete: "Configuración pendiente",
        }[value]
      }
    </span>
  );
}
function Configuration({ rows }: { rows: [string, boolean][] }) {
  return (
    <section className={styles.card} aria-labelledby="console-config-title">
      <h3 id="console-config-title">Configuración</h3>
      <dl className={styles.rows}>
        {rows.map(([label, present]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{present ? "Sí" : "No"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function Evidence({
  rows,
  note,
}: {
  rows: [string, boolean | undefined][];
  note: string;
}) {
  return (
    <section className={styles.card} aria-labelledby="console-evidence-title">
      <h3 id="console-evidence-title">Evidencia guardada</h3>
      <dl className={styles.rows}>
        {rows.map(([label, observed]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {observed === undefined
                ? "Sin comprobar"
                : observed
                  ? "Sí"
                  : "No"}
            </dd>
          </div>
        ))}
      </dl>
      <p className={styles.note}>{note}</p>
    </section>
  );
}
export function CrmConsole({
  area,
  snapshot: s,
  evidence,
  readAt,
}: {
  area: ConsoleArea;
  snapshot: CrmConsoleSnapshot;
  evidence: CrmConsoleEvidence;
  readAt: string;
}) {
  const summary: [string, Status][] = [
    ["Consulta profesional", state(s.practiceEnabled, true)],
    ["Google Calendar", state(s.calendarEnabled, s.calendarConfigured)],
    ["Recordatorios por correo", s.emailConfigured ? "enabled" : "incomplete"],
    ["Cobro del software", state(s.membershipEnabled, s.membershipConfigured)],
    ["Cobro de atención", state(s.careEnabled, s.careConfigured)],
    ["Videollamadas", s.callsConfigured ? "enabled" : "incomplete"],
    ["Grabación y transcripción", state(s.captureEnabled, s.captureConfigured)],
  ];
  const selected = consoleAreas.find((item) => item.id === area);
  const href = `/admin/consola?area=${area}`;
  return (
    <div className={styles.console}>
      <div className={styles.reading}>
        <p>
          Lectura del servidor:{" "}
          <time dateTime={readAt}>
            {new Intl.DateTimeFormat("es", {
              dateStyle: "short",
              timeStyle: "short",
              timeZone: "UTC",
            }).format(new Date(readAt))}{" "}
            UTC
          </time>
        </p>
        <a href={href}>
          Actualizar lectura <span aria-hidden="true">↻</span>
        </a>
      </div>
      <nav className={styles.areas} aria-label="Apartados de la consola">
        {consoleAreas.map((item) => (
          <Link
            key={item.id}
            href={`/admin/consola?area=${item.id}`}
            prefetch={false}
            aria-current={area === item.id ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <section className={styles.panel} aria-labelledby="console-panel-title">
        <div className={styles.panelHeading}>
          <h2 id="console-panel-title">{selected?.label}</h2>
          <span className={styles.readOnly}>Sólo lectura</span>
        </div>
        {evidence.unavailable ? (
          <p className={styles.warning} role="alert">
            No pudimos consultar la evidencia guardada. Actualiza la lectura
            para volver a intentarlo.
          </p>
        ) : null}
        {area === "resumen" ? (
          <>
            <table className={styles.summary}>
              <caption className={styles.visuallyHidden}>
                Disponibilidad actual de los módulos
              </caption>
              <thead>
                <tr>
                  <th scope="col">Módulo</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(([label, status]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td>
                      <StatusLabel value={status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.note}>
              Disponible significa que el código y su configuración permiten
              entrar al flujo. No acredita una conexión, un cobro, una entrega
              ni una grabación de prueba.
            </p>
          </>
        ) : null}
        {area === "practica" ? (
          <div className={styles.grid}>
            <Configuration
              rows={[["Consulta profesional habilitada", s.practiceEnabled]]}
            />
            <section className={styles.card}>
              <h3>Acceso profesional</h3>
              <p>
                La consulta requiere un perfil clínico aprobado. Cada
                profesional trabaja en su propio espacio; soporte y revisión
                tienen permisos separados.
              </p>
              <p className={styles.note}>
                Ser administrador no crea un perfil clínico ni permite entrar en
                la consulta de otra persona.
              </p>
              <Link
                className={styles.action}
                href="/admin/crm"
                prefetch={false}
              >
                Ver el espacio profesional <span aria-hidden="true">↗</span>
              </Link>
              <Link
                className={styles.action}
                href="/admin/operaciones"
                prefetch={false}
              >
                Verificación y soporte <span aria-hidden="true">↗</span>
              </Link>
            </section>
          </div>
        ) : null}
        {area === "calendario" ? (
          <>
            <div className={styles.grid}>
              <Configuration
                rows={[
                  ["Conexión habilitada", s.calendarEnabled],
                  ["Cliente OAuth presente", s.calendarClientPresent],
                  ["Secreto OAuth presente", s.calendarSecretPresent],
                  ["Callback presente", s.calendarCallbackPresent],
                  ["Clave de cifrado válida", s.calendarKeyValid],
                  ["Configuración completa y válida", s.calendarConfigured],
                ]}
              />
              <Evidence
                rows={[
                  [
                    "Hay una conexión guardada como activa",
                    evidence.calendarConnection,
                  ],
                ]}
                note="Un estado guardado no prueba que el token siga válido. La conexión requiere una prueba real de autorización, renovación y revocación."
              />
            </div>
            <p className={styles.note}>
              Nido copia las sesiones a un calendario propio en Google. Los
              cambios en Google no modifican las reservas de Nido. La descarga
              ICS es independiente.
            </p>
          </>
        ) : null}
        {area === "avisos" ? (
          <>
            <div className={styles.grid}>
              <Configuration
                rows={[
                  ["Clave del proveedor presente", s.emailKeyPresent],
                  ["Remitente presente", s.emailSenderPresent],
                  ["Envío de recordatorios configurado", s.emailConfigured],
                ]}
              />
              <Evidence
                rows={[
                  [
                    "Hay un recordatorio aceptado por el proveedor",
                    evidence.emailAccepted,
                  ],
                ]}
                note="Aceptado por la API no significa entregado ni leído. La aplicación todavía no acredita entrega o rebotes de estos recordatorios."
              />
            </div>
            <p className={styles.note}>
              Los recordatorios requieren activación voluntaria y correo
              verificado. Los avisos de la consulta abierta no son
              notificaciones al teléfono con la app cerrada.
            </p>
          </>
        ) : null}
        {area === "facturacion" ? (
          <>
            <div className={styles.grid}>
              <Configuration
                rows={[
                  ["Cobro del software habilitado", s.membershipEnabled],
                  ["Software: configuración completa", s.membershipConfigured],
                  ["Cobro de atención habilitado", s.careEnabled],
                  ["Atención: configuración completa", s.careConfigured],
                  ["Clave Stripe presente", s.stripeKeyPresent],
                  ["Secreto de webhook presente", s.stripeWebhookPresent],
                ]}
              />
              <Evidence
                rows={[
                  ["Hay una membresía registrada", evidence.membershipRecorded],
                  [
                    "Hay una cuenta Connect habilitada en el registro",
                    evidence.connectReady,
                  ],
                ]}
                note="Los registros no acreditan modo live, un cobro o un payout validado con Stripe. La disponibilidad depende del país y del estado real de la cuenta."
              />
            </div>
            <p className={styles.note}>
              Software, atención y pagos externos son flujos separados. Ayuda
              Terremoto permanece gratis. Estos indicadores corresponden al CRM;
              los paquetes antiguos requieren su propia comprobación de
              elegibilidad.
            </p>
          </>
        ) : null}
        {area === "llamadas" ? (
          <div className={styles.grid}>
            <Configuration
              rows={[
                ["Clave de videollamadas presente", s.callsConfigured],
                ["Captura habilitada", s.captureEnabled],
                ["Política de captura presente", s.capturePolicyPresent],
                ["Captura: configuración completa", s.captureConfigured],
              ]}
            />
            <section className={styles.card}>
              <h3>Validación del proveedor</h3>
              <p>Sin comprobar desde esta consola.</p>
              <p className={styles.note}>
                Se necesita una prueba de dos participantes, permisos separados
                de ambas partes y comprobación de grabación, transcripción,
                descarga y purga. Una clave presente no acredita ninguno de esos
                resultados.
              </p>
            </section>
          </div>
        ) : null}
      </section>
      <p className={styles.privacy}>
        Esta consola no muestra pacientes, contactos, contenido de sesiones,
        secretos ni registros técnicos en bruto. No activa funciones ni envía
        avisos.
      </p>
    </div>
  );
}
