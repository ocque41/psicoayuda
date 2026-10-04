import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { saveSettings } from "@/app/pro/consulta/actions";
import { AccountActions } from "@/components/account-actions";
import { CalendarConnectionPanel } from "@/components/calendar/connection-panel";
import { CredentialSettings } from "@/components/credential-settings";
import { PracticeForm, TimeZoneSelect } from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { AppointmentRemindersPanel } from "@/components/practice/reminder-preferences-panel";
import { PaymentConnections } from "@/components/workspace/payment-connections";
import { SettingsPanel } from "@/components/workspace/settings-panel";
import { db } from "@/db";
import { practiceSettings, user } from "@/db/schema";
import { hasCredentialPassword } from "@/lib/credentials";
import { requirePracticeProfessional } from "@/lib/practice/access";
import { getTurnstileConfig } from "@/lib/turnstile";
export const metadata: Metadata = {
  title: "Ajustes de tu consulta",
  robots: { index: false, follow: false },
};
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    calendario?: string;
    error?: string;
    ajuste?: string;
  }>;
}) {
  const pro = await requirePracticeProfessional();
  const [settings, accountUser, hasPassword, params] = await Promise.all([
    db.query.practiceSettings.findFirst({
      where: eq(practiceSettings.professionalId, pro.id),
    }),
    db.query.user.findFirst({
      where: eq(user.id, pro.userId),
      columns: { email: true, emailVerified: true },
    }),
    hasCredentialPassword(pro.userId),
    searchParams,
  ]);
  if (!accountUser) redirect("/entrar");
  const turnstile = getTurnstileConfig();
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Ajustes de tu consulta</h1>
        <p className="lead">
          Tu cuenta, horarios, avisos y conexiones, en un solo lugar.
        </p>
        <PracticeNav />
        <SettingsPanel
          initialSection={params.calendario ? "conexiones" : "cuenta"}
          sections={[
            {
              id: "cuenta",
              label: "Cuenta",
              icon: "profile",
              description:
                "Gestiona tu acceso y los datos de tu perfil profesional.",
              content: (
                <section className="workspace-card">
                  <h3>Acceso y seguridad</h3>
                  <p>{accountUser.email}</p>
                  <p className="hint">
                    {accountUser.emailVerified
                      ? "Correo verificado"
                      : "Correo pendiente de verificación"}
                  </p>
                  {params.error === "INVALID_TOKEN" ||
                  params.error === "TOKEN_EXPIRED" ? (
                    <p className="form-error" role="alert">
                      El enlace de confirmación de correo caducó o ya se usó.
                      Puedes pedir el cambio otra vez.
                    </p>
                  ) : null}
                  <CredentialSettings
                    currentEmail={accountUser.email}
                    emailVerified={Boolean(accountUser.emailVerified)}
                    hasPassword={hasPassword}
                    showPhones={false}
                    returnTo="/pro/ajustes"
                    turnstileSiteKey={
                      turnstile.enabled ? turnstile.siteKey : null
                    }
                  />
                  <p>
                    <Link className="button secondary" href="/pro/onboarding">
                      Editar mi perfil profesional
                    </Link>
                  </p>
                  <p>
                    <Link href="/pro/dashboard#cuenta">
                      Gestionar teléfonos de contacto →
                    </Link>
                  </p>
                  <p>
                    <Link href="/pro/dashboard#disponibilidad">
                      Configurar mi disponibilidad y cupos →
                    </Link>
                  </p>
                  <p>
                    <Link href="/pro/plan">Gestionar mi plan de Nido →</Link>
                  </p>
                </section>
              ),
            },
            {
              id: "agenda",
              label: "Agenda",
              icon: "calendar",
              description:
                "Elige tu zona horaria y cuándo recibir nuevas solicitudes.",
              anchors: ["practice-settings", "practice-settings-primary"],
              content: (
                <div className="card" id="practice-settings">
                  <div id="practice-settings-primary">
                    <h2>Zona horaria y horario de solicitudes</h2>
                    <p>
                      Las nuevas ofertas automáticas se envían durante este
                      horario. Los avisos de mensajes mantienen su entrega
                      habitual.
                    </p>
                    <PracticeForm action={saveSettings}>
                      <TimeZoneSelect value={settings?.timeZone} />
                      <label>
                        Recibir ofertas desde (hora local)
                        <input
                          type="number"
                          name="workStart"
                          min={0}
                          max={23}
                          defaultValue={settings?.workStart ?? 9}
                          required
                        />
                      </label>
                      <label>
                        Hasta (hora local, fin excluido)
                        <input
                          type="number"
                          name="workEnd"
                          min={1}
                          max={24}
                          defaultValue={settings?.workEnd ?? 18}
                          required
                        />
                      </label>
                    </PracticeForm>
                  </div>
                </div>
              ),
            },
            {
              id: "avisos",
              label: "Avisos",
              icon: "message",
              description:
                "Personaliza los correos de recordatorio de tus sesiones.",
              anchors: ["reminders-professional"],
              content: (
                <AppointmentRemindersPanel
                  userId={pro.userId}
                  audience="professional"
                  timeZone={settings?.timeZone || "America/Caracas"}
                />
              ),
            },
            {
              id: "conexiones",
              label: "Conexiones",
              icon: "settings",
              description:
                "Lleva tu agenda a Google y consulta las opciones de cobro.",
              anchors: ["practice-calendar-settings", "calendar-title-pro"],
              content: (
                <>
                  <div id="practice-calendar-settings">
                    <CalendarConnectionPanel
                      userId={pro.userId}
                      audience="pro"
                      feedback={params.calendario}
                    />
                  </div>
                  <PaymentConnections />
                </>
              ),
            },
            {
              id: "privacidad",
              label: "Privacidad",
              icon: "leaf",
              description:
                "Controla el acceso a tu cuenta y consulta cómo se gestionan tus datos.",
              content: (
                <section className="workspace-card">
                  <h3>Tu cuenta y tus datos</h3>
                  <p>
                    Conserva tu código de recuperación del chat. La cuenta y las
                    conexiones externas no sustituyen ese código.
                  </p>
                  <p>
                    <Link href="/privacidad">Ver privacidad</Link> ·{" "}
                    <Link href="/pro/soporte">Pedir ayuda con mis datos</Link>
                  </p>
                  <AccountActions />
                </section>
              ),
            },
          ]}
        />
      </div>
    </section>
  );
}
