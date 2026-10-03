import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PracticeNav } from "@/components/practice/nav";
import { SupportTicketList } from "@/components/support/list";
import styles from "@/components/support/support.module.css";
import { requireSupportProfessional } from "@/lib/practice/support-access";
import { readProfessionalSupportList } from "@/lib/practice/support-queries";
export const metadata: Metadata = {
  title: "Soporte de tu consulta",
  robots: { index: false, follow: false },
};
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  const actor = await requireSupportProfessional();
  if (!actor) redirect("/pro");
  const query = await searchParams;
  const list = await readProfessionalSupportList(actor, {
    status: query.estado,
    page: query.pagina,
  });
  return (
    <section className="section">
      <div className="container practice-shell">
        <h1>Estamos para ayudarte</h1>
        <PracticeNav />
        <p className="lead">
          Cada consulta tiene su conversación. Encuentra las respuestas del
          equipo y continúa cuando lo necesites.
        </p>
        <section aria-labelledby="support-history">
          <div className={styles.header}>
            <div>
              <h2 id="support-history">Tus consultas</h2>
              <p>
                El historial permanece aquí, también después de resolver una
                consulta.
              </p>
            </div>
            <Link
              className="button ghost"
              href="/pro/soporte/nueva"
              prefetch={false}
            >
              Escribir al equipo
            </Link>
          </div>
          <SupportTicketList
            list={list}
            timeZone={actor.timeZone}
            basePath="/pro/soporte"
            detailPath="/pro/soporte"
          />
        </section>
      </div>
    </section>
  );
}
