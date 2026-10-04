import { sql } from "drizzle-orm";
import type { Metadata } from "next";
import {
  type ConsoleArea,
  CrmConsole,
  type CrmConsoleEvidence,
  type CrmConsoleSnapshot,
  resolveConsoleArea,
} from "@/components/admin/crm-console";
import { AdminShell } from "@/components/admin/shell";
import { AuthPanel } from "@/components/auth-panel";
import { db } from "@/db";
import { requireAdmin } from "@/lib/admin";
import { getServerSession } from "@/lib/auth-server";
import { googleCalendarConfig } from "@/lib/calendar/config";
import { calendarKeyConfigured } from "@/lib/calendar/crypto";
import { membershipBillingReady } from "@/lib/practice/billing";
import { callsConfigured, captureConfigured } from "@/lib/practice/calls";
import { careBillingConfigured } from "@/lib/practice/care";
import { reminderProviderReady } from "@/lib/practice/reminder-preferences";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Consola del CRM",
  robots: { index: false, follow: false },
};

function observedBoolean(value: unknown) {
  if (value !== 0 && value !== 1)
    throw new Error("console_evidence_unavailable");
  return value === 1;
}

// Sólo agrega booleanos de existencia. No carga ni serializa filas de usuarios,
// fichas, tokens, mensajes o citas. Cada apartado consulta su propia evidencia.
async function readEvidence(area: ConsoleArea): Promise<CrmConsoleEvidence> {
  try {
    if (area === "calendario") {
      const [row] = await db.values<[number]>(sql`SELECT EXISTS(
        SELECT 1 FROM google_calendar_connections WHERE status='connected' LIMIT 1
      )`);
      return { calendarConnection: observedBoolean(row?.[0]) };
    }
    if (area === "avisos") {
      const [row] = await db.values<[number]>(sql`SELECT EXISTS(
        SELECT 1 FROM appointment_reminder_deliveries WHERE status='sent' LIMIT 1
      )`);
      return { emailAccepted: observedBoolean(row?.[0]) };
    }
    if (area === "facturacion") {
      const [row] = await db.values<[number, number]>(sql`SELECT
        EXISTS(SELECT 1 FROM professional_memberships LIMIT 1),
        EXISTS(SELECT 1 FROM professionals WHERE status='approved'
          AND non_clinical_helper=0 AND offers_paid_services=1
          AND stripe_account_id IS NOT NULL
          AND stripe_charges_enabled=1 AND stripe_payouts_enabled=1 LIMIT 1)`);
      return {
        membershipRecorded: observedBoolean(row?.[0]),
        connectReady: observedBoolean(row?.[1]),
      };
    }
    return {};
  } catch {
    // Nunca convertir una consulta fallida en un «no» ni imprimir errores SQL.
    return { unavailable: true };
  }
}

export default async function AdminConsolePage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string | string[] }>;
}) {
  const administrator = await requireAdmin();
  if (!administrator) {
    const session = await getServerSession();
    return (
      <section className="section">
        <div className="container">
          <h1>Consola del CRM</h1>
          {session?.user ? (
            <div className="card">
              <p>Esta cuenta no tiene acceso a la consola de administración.</p>
              <p>Entra con una cuenta administradora verificada.</p>
            </div>
          ) : (
            <div className="signin">
              <p className="lead">
                Entra con una cuenta administradora para revisar el estado del
                CRM.
              </p>
              <AuthPanel
                callbackURL="/admin/consola"
                googleEnabled={Boolean(
                  process.env.GOOGLE_CLIENT_ID?.trim() &&
                    process.env.GOOGLE_CLIENT_SECRET?.trim(),
                )}
              />
            </div>
          )}
        </div>
      </section>
    );
  }
  const area = resolveConsoleArea((await searchParams).area);
  const snapshot: CrmConsoleSnapshot = {
    practiceEnabled: process.env.NIDO_PRACTICE_ENABLED === "true",
    calendarEnabled: process.env.NIDO_GOOGLE_CALENDAR_ENABLED === "true",
    calendarConfigured: Boolean(googleCalendarConfig()),
    calendarClientPresent: Boolean(
      process.env.NIDO_GOOGLE_CALENDAR_CLIENT_ID?.trim(),
    ),
    calendarSecretPresent: Boolean(
      process.env.NIDO_GOOGLE_CALENDAR_CLIENT_SECRET?.trim(),
    ),
    calendarCallbackPresent: Boolean(
      process.env.NIDO_GOOGLE_CALENDAR_REDIRECT_URI?.trim(),
    ),
    calendarKeyValid: calendarKeyConfigured(),
    emailConfigured: reminderProviderReady(),
    emailKeyPresent: Boolean(process.env.RESEND_API_KEY),
    emailSenderPresent: Boolean(process.env.CONTACT_FROM_EMAIL),
    membershipEnabled: process.env.NIDO_MEMBERSHIP_BILLING_ENABLED === "true",
    membershipConfigured: membershipBillingReady(),
    careEnabled: process.env.NIDO_CARE_BILLING_ENABLED === "true",
    careConfigured: careBillingConfigured(),
    stripeKeyPresent: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhookPresent: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    callsConfigured: callsConfigured(),
    captureEnabled: process.env.NIDO_CALL_CAPTURE_ENABLED === "true",
    captureConfigured: captureConfigured(),
    capturePolicyPresent: Boolean(process.env.NIDO_CALL_CAPTURE_POLICY_URL),
  };
  const evidence = await readEvidence(area);
  return (
    <AdminShell
      active="consola"
      title="Consola del CRM"
      description="Configuración actual y evidencia, por apartado."
    >
      <CrmConsole
        area={area}
        snapshot={snapshot}
        evidence={evidence}
        readAt={new Date().toISOString()}
      />
    </AdminShell>
  );
}
