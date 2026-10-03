import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { saveSettings } from "@/app/pro/consulta/actions";
import { PracticeForm, TimeZoneSelect } from "@/components/practice/forms";
import { PracticeNav } from "@/components/practice/nav";
import { db } from "@/db";
import { practiceSettings } from "@/db/schema";
import { requirePracticeProfessional } from "@/lib/practice/access";
export const metadata: Metadata = {
  title: "Horario de tu consulta",
  robots: { index: false, follow: false },
};
export default async function SettingsPage() {
  const pro = await requirePracticeProfessional();
  const settings = await db.query.practiceSettings.findFirst({
    where: eq(practiceSettings.professionalId, pro.id),
  });
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Tu horario también importa</h1>
        <PracticeNav />
        <div className="card">
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
      </div>
    </section>
  );
}
