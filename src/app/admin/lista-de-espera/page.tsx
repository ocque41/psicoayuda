import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { adminUpdateWaitlistStatus } from "@/app/actions-waitlist";
import { AdminShell } from "@/components/admin/shell";
import { db } from "@/db";
import { waitlistEntries } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import {
  type WaitlistSource,
  type WaitlistStatus,
  waitlistSourceLabels,
  waitlistStatuses,
  waitlistStatusLabels,
} from "@/lib/waitlist";
export const dynamic = "force-dynamic";
export default async function WaitlistAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  if (!(await requireAdmin())) redirect("/entrar");
  const params = await searchParams;
  const status = waitlistStatuses.includes(params.estado as WaitlistStatus)
    ? (params.estado as WaitlistStatus)
    : "waiting";
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(params.pagina ?? "1", 10) || 1),
  );
  const entries = await db
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.status, status),
        isNull(waitlistEntries.anonymizedAt),
      ),
    )
    .orderBy(desc(waitlistEntries.createdAt), desc(waitlistEntries.id))
    .limit(51)
    .offset((page - 1) * 50);
  return (
    <AdminShell
      active="lista-espera"
      title="Lista de espera general"
      description="Solicitudes de apoyo general, separadas de las solicitudes y cupos de Ayuda Terremoto."
    >
      <nav aria-label="Estado de la lista de espera">
        {waitlistStatuses.map((value) => (
          <Link
            key={value}
            href={`/admin/lista-de-espera?estado=${value}`}
            aria-current={value === status ? "page" : undefined}
          >
            {waitlistStatusLabels[value]} ·{" "}
          </Link>
        ))}
      </nav>
      {entries.length ? (
        <ul>
          {entries.slice(0, 50).map((entry) => (
            <li key={entry.id} className="card">
              <h2>{entry.title}</h2>
              <p>{entry.description}</p>
              <p>{entry.email}</p>
              <p>
                {waitlistSourceLabels[entry.source as WaitlistSource] ??
                  "Formulario"}{" "}
                · {entry.createdAt.slice(0, 10)}
              </p>
              <form action={adminUpdateWaitlistStatus}>
                <input type="hidden" name="waitlistId" value={entry.id} />
                <label htmlFor={`status-${entry.id}`}>Estado</label>
                <select
                  id={`status-${entry.id}`}
                  name="status"
                  defaultValue={entry.status}
                >
                  {waitlistStatuses.map((value) => (
                    <option key={value} value={value}>
                      {waitlistStatusLabels[value]}
                    </option>
                  ))}
                </select>
                <button type="submit" className="button secondary">
                  Guardar estado
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p>No hay solicitudes en este estado.</p>
      )}
      {page > 1 ? (
        <Link
          href={`/admin/lista-de-espera?estado=${status}&pagina=${page - 1}`}
        >
          Anterior
        </Link>
      ) : null}
      {entries.length > 50 ? (
        <Link
          href={`/admin/lista-de-espera?estado=${status}&pagina=${page + 1}`}
        >
          Siguiente
        </Link>
      ) : null}
    </AdminShell>
  );
}
