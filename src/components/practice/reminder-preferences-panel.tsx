import { savePatientReminders } from "@/app/mi/ajustes/reminder-actions";
import { saveProfessionalReminders } from "@/app/pro/ajustes/reminder-actions";
import type { ReminderRole } from "@/lib/practice/reminder-options";
import { reminderPreferencesForUser } from "@/lib/practice/reminder-preferences";
import { ReminderGuide } from "./reminder-guide";
import styles from "./reminder-preferences.module.css";
import { ReminderPreferencesForm } from "./reminder-preferences-form";

export async function AppointmentRemindersPanel({
  userId,
  audience,
  timeZone,
}: {
  userId: string;
  audience: ReminderRole;
  timeZone: string;
}) {
  const preferences = await reminderPreferencesForUser(
    userId,
    audience,
    timeZone,
  );
  return (
    <section
      id={`reminders-${audience}`}
      className={`workspace-card ${styles.panel}`}
      aria-labelledby={`reminders-${audience}-title`}
    >
      <p className="kicker">A tu gusto</p>
      <h2 id={`reminders-${audience}-title`}>Recordatorios de tus sesiones</h2>
      <ReminderGuide targetId={`reminders-${audience}`} />
      <p>
        Elige cuándo quieres recibir un aviso y la zona horaria en la que te
        mostramos tu próximo encuentro.
      </p>
      <ReminderPreferencesForm
        preferences={preferences}
        action={
          audience === "professional"
            ? saveProfessionalReminders
            : savePatientReminders
        }
      />
    </section>
  );
}
