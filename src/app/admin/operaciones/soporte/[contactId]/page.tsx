import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  replySupport,
  updateSupportStatus,
} from "@/app/admin/operaciones/actions";
import { adminNavigation } from "@/components/admin/navigation";
import { AdminShell } from "@/components/admin/shell";
import { PracticeForm } from "@/components/practice/forms";
import { SupportStatus } from "@/components/support/list";
import { SupportReplyForm } from "@/components/support/reply-form";
import styles from "@/components/support/support.module.css";
import { SupportThread } from "@/components/support/thread";
import { requireAdmin } from "@/lib/admin";
import { contactCategoryLabels } from "@/lib/contact-messages";
import { orient } from "@/lib/practice/orientation";
import { requireSupportStaff } from "@/lib/practice/support-access";
import { readStaffSupportThread } from "@/lib/practice/support-queries";
export const metadata: Metadata = {
  title: "Consulta de soporte",
  robots: { index: false, follow: false },
};
export default async function StaffSupportDetail({
  params,
  searchParams,
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const actor = await requireSupportStaff();
  if (!actor) redirect("/pro");
  const [{ contactId }, query, administrator] = await Promise.all([
    params,
    searchParams,
    requireAdmin(),
  ]);
  const navigation = administrator
    ? adminNavigation
    : [
        {
          id: "operaciones",
          label: "Verificación y soporte",
          href: "/admin/operaciones",
          description: "Conversaciones con el equipo de Nido.",
        },
      ];
  const thread = await readStaffSupportThread(actor, contactId, query.pagina);
  if (!thread) notFound();
  const flags = [
    thread.ticket.body,
    ...thread.replies.map((reply) => reply.body),
  ].some(
    (text) =>
      orient({
        text,
        country: "Venezuela",
        language: "es",
        ageGroup: "adult",
        forWhom: "self",
        immediateDanger: "no",
      }).safetySignal,
  );
  return (
    <AdminShell
      active="operaciones"
      items={navigation}
      accountEmail={administrator?.email}
      title={contactCategoryLabels[thread.ticket.category]}
      description="Revisa el historial y registra el siguiente paso de esta consulta."
    >
      <div className={styles.thread}>
        <Link className={styles.back} href="/admin/operaciones">
          ← Volver a operaciones
        </Link>
        <p>
          {thread.ticket.name || "Contacto"} ·{" "}
          {thread.ticket.source === "professional_dashboard"
            ? "Panel profesional"
            : "Contacto público"}
        </p>
        <SupportStatus status={thread.ticket.status} />
        {flags ? (
          <p className={styles.notice} role="alert">
            Hay una mención que requiere revisión humana prioritaria. Esta señal
            automática no confirma seguridad. Comprueba la ubicación y el
            siguiente paso con la persona.
          </p>
        ) : null}
        <SupportThread
          thread={thread}
          basePath={`/admin/operaciones/soporte/${contactId}`}
          staff
        />
        {thread.ticket.professionalId ? (
          <SupportReplyForm
            action={replySupport}
            contactId={contactId}
            revision={thread.revision}
            staff
            resolved={thread.ticket.status === "resolved"}
          />
        ) : (
          <section className={styles.reply}>
            <h2>Seguimiento del contacto</h2>
            <p>
              La respuesta a este contacto público se envía desde el correo del
              equipo. Cambiar el estado no envía un mensaje.
            </p>
            <a
              className="button ghost"
              href={`mailto:${encodeURIComponent(thread.ticket.email)}?subject=Respuesta%20de%20Nido`}
            >
              Responder desde el correo
            </a>
            <PracticeForm action={updateSupportStatus} submit="Guardar estado">
              <input type="hidden" name="contactId" value={contactId} />
              <input type="hidden" name="revision" value={thread.revision} />
              <label>
                Estado
                <select name="status" defaultValue={thread.ticket.status}>
                  <option value="new">Nuevo</option>
                  <option value="in_review">En revisión</option>
                  <option value="resolved">Resuelto</option>
                </select>
              </label>
            </PracticeForm>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
