import Link from "next/link";
import { AccountActions } from "@/components/account-actions";
import { CalendarConnectionPanel } from "@/components/calendar/connection-panel";
import { CredentialSettings } from "@/components/credential-settings";
import { PracticeForm } from "@/components/practice/forms";
import { AppointmentRemindersPanel } from "@/components/practice/reminder-preferences-panel";
import { WorkspaceShell } from "@/components/workspace/shell";
import { hasCredentialPassword } from "@/lib/credentials";
import { COUNTRY_OPTIONS, TIME_ZONES } from "@/lib/geography";
import { requirePatientAccount } from "@/lib/patient/access";
import { getTurnstileConfig } from "@/lib/turnstile";
import { savePatientPreferences, sendPatientVerification } from "../actions";
export default async function PatientSettings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; calendario?: string }>;
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
      title="Un espacio a tu medida"
      description="Tú eliges cómo llamarte y dónde organizar tu tiempo. No guardamos relatos clínicos en estas preferencias."
    >
      <div className="workspace-grid">
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
              <select name="timezone" defaultValue={account.timezone} required>
                {Array.from(new Set([account.timezone, ...TIME_ZONES])).map(
                  (zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll("_", " ")}
                    </option>
                  ),
                )}
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
                <option value="other">Otro · acordar con el profesional</option>
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
          <h2>Acceso y privacidad</h2>
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
                Te enviamos un enlace de un solo uso. No compartas ese enlace.
              </p>
            </PracticeForm>
          ) : null}
          <h3>Seguridad de tu cuenta</h3>
          {emailLinkError ? (
            <p className="form-error" role="alert">
              {emailLinkError}
            </p>
          ) : null}
          <CredentialSettings
            currentEmail={user.email}
            emailVerified={Boolean(user.emailVerified)}
            hasPassword={hasPassword}
            turnstileSiteKey={turnstile.enabled ? turnstile.siteKey : null}
            showPhones={false}
            returnTo="/mi/ajustes"
          />
          <p>
            El cifrado del chat requiere conservar tu código de recuperación. La
            cuenta organiza tus conversaciones y no sustituye ese código.
          </p>
          <Link href="/mi/mensajes" className="button secondary">
            Conectar conversaciones
          </Link>
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
            Eliminar la cuenta cancela las suscripciones de atención vinculadas
            y retira tu espacio personal. Los registros que conserva el
            profesional y las conversaciones compartidas tienen su propio
            proceso de conservación y eliminación. Para borrar un chat, usa su
            papelera.
          </p>
          <p className="hint">
            <Link href="/contacto">Solicitar ayuda con mis datos</Link> ·{" "}
            <Link href="/privacidad">Ver privacidad</Link>
          </p>
          <AccountActions />
        </section>
      </div>
      <AppointmentRemindersPanel
        userId={account.userId}
        audience="patient"
        timeZone={account.timezone}
      />
      <CalendarConnectionPanel
        userId={user.id}
        audience="patient"
        feedback={params.calendario}
      />
    </WorkspaceShell>
  );
}
