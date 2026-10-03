import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createProfessionalContactMessage } from "@/app/actions-contact";
import { ContactMessageForm } from "@/components/contact-message-form";
import { PracticeNav } from "@/components/practice/nav";
import styles from "@/components/support/support.module.css";
import { requireSupportProfessional } from "@/lib/practice/support-access";
export const metadata: Metadata = {
  title: "Escribir al equipo",
  robots: { index: false, follow: false },
};
export default async function NewSupportTicket() {
  const actor = await requireSupportProfessional();
  if (!actor) redirect("/pro");
  return (
    <section className="section">
      <div className="container practice-shell">
        <PracticeNav />
        <Link className={styles.back} href="/pro/soporte">
          ← Todas tus consultas
        </Link>
        <h1>Escribir al equipo</h1>
        <p className="lead">
          Pregunta por tu verificación, los cupos, el chat o tu consulta. Para
          continuar un tema abierto, responde en su conversación.
        </p>
        <div className={styles.thread}>
          <section className={styles.reply}>
            <ContactMessageForm
              action={createProfessionalContactMessage}
              audience="professional"
            />
          </section>
          <p className={styles.notice}>
            Después de enviar, encontrarás esta consulta en tu historial de
            soporte.
          </p>
          <Link className="button ghost" href="/pro/soporte">
            Ver mis consultas
          </Link>
        </div>
      </div>
    </section>
  );
}
