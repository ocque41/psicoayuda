import Link from "next/link";
import { AccountActions } from "@/components/account-actions";
import { CalendarConnectionPanel } from "@/components/calendar/connection-panel";
import { CredentialSettings } from "@/components/credential-settings";
import { PracticeForm } from "@/components/practice/forms";
import { AppointmentRemindersPanel } from "@/components/practice/reminder-preferences-panel";
import { SettingsPanel } from "@/components/workspace/settings-panel";
import { WorkspaceShell } from "@/components/workspace/shell";
import { hasCredentialPassword } from "@/lib/credentials";
import { COUNTRY_OPTIONS, TIME_ZONES } from "@/lib/geography";
import { requirePatientAccount } from "@/lib/patient/access";
import { getTurnstileConfig } from "@/lib/turnstile";
import { savePatientPreferences, sendPatientVerification } from "../actions";
export default async function PatientSettings({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    calendario?: string;
    ajuste?: string;
  }>;
}) {
  const { account, user } = await requirePatientAccount();
  const [hasPassword, params] = await Promise.all([
    hasCredentialPassword(user.id),
    searchParams,
  ]);
  const turnstile = getTurnstileConfig();
  const emailLinkError =
    params.error === "INVALID_TOKEN" || params.error === "TOKEN_EXPIRED"
      ? "El enlace de confirmación de correo caducó o ya se usó. Puedes pedir el cambio otra vez desde tu cuenta."
      : null;
  return (
    <WorkspaceShell
      audience="patient"
      title="Ajustes de tu espacio"
      description="Tu cuenta, horarios, avisos y conexiones, en un solo lugar."
    >
      <SettingsPanel
        initialSection={params.calendario ? "conexiones" : "cuenta"}
        sections={[
          {
            id: "cuenta",
            label: "Cuenta",
            icon: "profile",
            description:
              "Elige cómo llamarte y gestiona el acceso a tu cuenta.",
            content: (
              <>
                <section className="workspace-card">
                  <h2>Tus preferencias</h2>
                  <PracticeForm
                    action={savePatientPreferences}
                    submit="Guardar preferencias"
                  >
                    <label>
                      Cómo te llamamos
                      <input
                        name="displayName"
                        autoComplete="nickname"
                        maxLength={80}
                        defaultValue={account.displayName}
                        required
                      />
                    </label>
                    <label>
                      País donde recibes atención
                      <select
                        name="country"
                        autoComplete="country"
                        defaultValue={account.country}
                        required
                      >
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Zona horaria
                      <select
                        name="timezone"
                        defaultValue={account.timezone}
                        required
                      >
                        {Array.from(
                          new Set([account.timezone, ...TIME_ZONES]),
                        ).map((zone) => (
                          <option key={zone} value={zone}>
                            {zone.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Idioma preferido
                      <select
                        name="preferredLanguage"
                        defaultValue={account.preferredLanguage}
                      >
                        <option value="es">Español</option>
                        <option value="en">Inglés</option>
                        <option value="pt">Portugués</option>
                        <option value="fr">Francés</option>
                        <option value="other">
                          Otro · acordar con el profesional
                        </option>
                      </select>
                    </label>
                    <label>
                      Uso de la cuenta
                      <select name="ageBand" defaultValue={account.ageBand}>
                        <option value="adult">
                          Soy mayor de edad y busco apoyo para mí
                        </option>
                        <option value="guardian">
                          Soy representante y coordino apoyo
                        </option>
                      </select>
                    </label>
                  </PracticeForm>
                </section>
                <section className="workspace-card">
                  <h2>Acceso y seguridad</h2>
                  <p>{user.email}</p>
                  <p className="hint">
                    {user.emailVerified
                      ? "Correo verificado"
                      : "El correo aún no está verificado. Un correo escrito en un chat no concede acceso a sus mensajes."}
                  </p>
                  {!user.emailVerified ? (
                    <PracticeForm
                      action={sendPatientVerification}
                      submit="Verificar mi correo"
                    >
                      <p className="hint">
                        Te enviamos un enlace de un solo uso. No compartas ese
                        enlace.
                      </p>
                    </PracticeForm>
                  ) : null}
                  {emailLinkError ? (
                    <p className="form-error" role="alert">
                      {emailLinkError}
                    </p>
                  ) : null}
                  <CredentialSettings
                    currentEmail={user.email}
                    emailVerified={Boolean(user.emailVerified)}
                    hasPassword={hasPassword}
                    turnstileSiteKey={
                      turnstile.enabled ? turnstile.siteKey : null
                    }
                    showPhones={false}
                    returnTo="/mi/ajustes"
                  />
                </section>
              </>
            ),
          },
          {
            id: "agenda",
            label: "Agenda",
            icon: "calendar",
            description: "Organiza tus sesiones en tu zona horaria.",
            content: (
              <section className="workspace-card">
                <h3>Tu tiempo</h3>
                <p>
                  Tu zona horaria es{" "}
                  <strong>{account.timezone.replaceAll("_", " ")}</strong>.
                  Puedes cambiarla en el apartado Cuenta.
                </p>
                <p>
                  <Link
                    href="/mi/ajustes?ajuste=cuenta"
                    className="button secondary"
                  >
                    Cambiar zona horaria
                  </Link>
                </p>
                <Link href="/mi/calendario" className="link-arrow">
                  Abrir mi calendario →
                </Link>
              </section>
            ),
          },
          {
            id: "avisos",
            label: "Avisos",
            icon: "message",
            description:
              "Elige cuándo recibir los correos de recordatorio de Nido.",
            anchors: ["reminders-patient"],
            content: (
              <AppointmentRemindersPanel
                userId={account.userId}
                audience="patient"
                timeZone={account.timezone}
              />
            ),
          },
          {
            id: "conexiones",
            anchors: ["calendar-title-patient"],
            label: "Conexiones",
            icon: "settings",
            description:
              "Lleva tu agenda a Google y vincula tus conversaciones.",
            content: (
              <>
                <CalendarConnectionPanel
                  userId={user.id}
                  audience="patient"
                  feedback={params.calendario}
                />
                <section className="workspace-card">
                  <h3>Tus conversaciones</h3>
                  <p>
                    Vincula a tu cuenta los chats para los que ya tengas acceso
                    verificado.
                  </p>
                  <Link href="/mi/mensajes" className="button secondary">
                    Conectar conversaciones
                  </Link>
                </section>
              </>
            ),
          },
          {
            id: "privacidad",
            label: "Privacidad",
            icon: "leaf",
            description:
              "Consulta, descarga y gestiona los datos de tu cuenta.",
            content: (
              <section className="workspace-card">
                <h3>Tu cuenta y tus datos</h3>
                <p>
                  El cifrado del chat requiere conservar tu código de
                  recuperación. La cuenta organiza tus conversaciones y no
                  sustituye ese código.
                </p>

                <p>
                  <a
                    className="button secondary"
                    href="/mi/exportar"
                    download="nido-mis-datos.json"
                  >
                    Descargar mis datos
                  </a>
                </p>
                <p className="hint">
                  Eliminar la cuenta cancela las suscripciones de atención
                  vinculadas y retira tu espacio personal. Los registros que
                  conserva el profesional y las conversaciones compartidas
                  tienen su propio proceso de conservación y eliminación. Para
                  borrar un chat, usa su papelera.
                </p>
                <p className="hint">
                  <Link href="/contacto">Solicitar ayuda con mis datos</Link> ·{" "}
                  <Link href="/privacidad">Ver privacidad</Link>
                </p>
                <AccountActions />
              </section>
            ),
          },
        ]}
      />
    </WorkspaceShell>
  );
}
