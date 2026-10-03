import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createProfessionalContactMessage } from "@/app/actions-contact";
import { ContactMessageForm } from "@/components/contact-message-form";
import { PracticeNav } from "@/components/practice/nav";
import { db } from "@/db";
import { contactMessages, professionals, supportReplies } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { contactStatusLabels } from "@/lib/contact-messages";
import { dateLabel } from "@/lib/practice/domain";
export const metadata: Metadata = {
  title: "Soporte de tu consulta",
  robots: { index: false, follow: false },
};
export default async function SupportPage() {
  const session = await getServerSession();
  if (!session?.user.id) redirect("/pro");
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
    columns: { id: true },
  });
  if (!pro) redirect("/pro/onboarding");
  const tickets = await db
    .select()
    .from(contactMessages)
    .where(eq(contactMessages.professionalId, pro.id))
    .orderBy(desc(contactMessages.createdAt))
    .limit(50);
  const replies = tickets.length
    ? await db
        .select({
          id: supportReplies.id,
          contactId: supportReplies.contactId,
          body: supportReplies.body,
          createdAt: supportReplies.createdAt,
        })
        .from(supportReplies)
        .where(
          inArray(
            supportReplies.contactId,
            tickets.map((t) => t.id),
          ),
        )
        .orderBy(asc(supportReplies.createdAt))
    : [];
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Estamos para ayudarte</h1>
        <PracticeNav />
        <div className="practice-columns">
          <section>
            <h2>Escribir al equipo</h2>
            <p>
              Pregunta por tu verificación, los cupos, el chat o tu consulta.
              Evita compartir historias clínicas o nombres de pacientes.
            </p>
            <ContactMessageForm
              action={createProfessionalContactMessage}
              audience="professional"
            />
          </section>
          <section>
            <h2>Tus consultas</h2>
            {tickets.map((t) => (
              <article className="card" key={t.id}>
                <span className="panel-chip">
                  {contactStatusLabels[
                    t.status as keyof typeof contactStatusLabels
                  ] || "En revisión"}
                </span>
                <p>{t.message}</p>
                <small>{dateLabel(t.createdAt)}</small>
                {replies
                  .filter((r) => r.contactId === t.id)
                  .map((r) => (
                    <div className="orientation-message" key={r.id}>
                      <strong>Equipo de Nido</strong>
                      <p>{r.body}</p>
                      <small>{dateLabel(r.createdAt)}</small>
                    </div>
                  ))}
              </article>
            ))}
            {!tickets.length ? (
              <p>Aquí verás tus consultas y las respuestas del equipo.</p>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
