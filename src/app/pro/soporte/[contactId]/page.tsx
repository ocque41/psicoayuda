import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { replyProfessionalSupport } from "@/app/pro/soporte/actions";
import { PracticeNav } from "@/components/practice/nav";
import { SupportStatus } from "@/components/support/list";
import { SupportReplyForm } from "@/components/support/reply-form";
import styles from "@/components/support/support.module.css";
import { SupportThread } from "@/components/support/thread";
import { contactCategoryLabels } from "@/lib/contact-messages";
import { requireSupportProfessional } from "@/lib/practice/support-access";
import { readSupportThread } from "@/lib/practice/support-queries";
export const metadata: Metadata = {
  title: "Tu conversación con Nido",
  robots: { index: false, follow: false },
};
export default async function SupportDetail({
  params,
  searchParams,
}: {
  params: Promise<{ contactId: string }>;
  searchParams: Promise<{ pagina?: string }>;
}) {
  const actor = await requireSupportProfessional();
  if (!actor) redirect("/pro");
  const [{ contactId }, query] = await Promise.all([params, searchParams]);
  const thread = await readSupportThread(actor, contactId, query.pagina);
  if (!thread) notFound();
  return (
    <section className="section">
      <div className="container practice-shell">
        <PracticeNav />
        <Link className={styles.back} href="/pro/soporte">
          ← Todas tus consultas
        </Link>
        <h1>{contactCategoryLabels[thread.ticket.category]}</h1>
        <SupportStatus status={thread.ticket.status} />
        <div className={styles.thread}>
          <SupportThread
            thread={thread}
            timeZone={actor.timeZone}
            basePath={`/pro/soporte/${contactId}`}
          />
          <SupportReplyForm
            action={replyProfessionalSupport}
            contactId={contactId}
            revision={thread.revision}
            resolved={thread.ticket.status === "resolved"}
          />
        </div>
      </div>
    </section>
  );
}
