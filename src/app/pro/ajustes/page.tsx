import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { saveSettings } from "@/app/pro/consulta/actions";
import { CalendarConnectionPanel } from "@/components/calendar/connection-panel";
import { PracticeForm, TimeZoneSelect } from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { AppointmentRemindersPanel } from "@/components/practice/reminder-preferences-panel";
import { db } from "@/db";
import { practiceSettings } from "@/db/schema";
import { requirePracticeProfessional } from "@/lib/practice/access";
export const metadata: Metadata = {
  title: "Preferencias de tu consulta",
  robots: { index: false, follow: false },
};
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendario?: string }>;
}) {
  const pro = await requirePracticeProfessional();
  const settings = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  const params = await searchParams;
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Tu consulta, a tu medida</h1>
        <PracticeNav />
        <div className="card" id="practice-settings">
          <h2>Zona horaria y horario de solicitudes</h2>
          <p>
            Las nuevas ofertas automáticas se envían durante este horario. Los
            avisos de mensajes mantienen su entrega habitual.
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
        <AppointmentRemindersPanel
          userId={pro.userId}
          audience="professional"
          timeZone={settings?.timeZone || "America/Caracas"}
        />
        <div id="practice-calendar-settings">
          <CalendarConnectionPanel
            userId={pro.userId}
            audience="pro"
            feedback={params.calendario}
          />
        </div>
      </div>
    </section>
  );
}
