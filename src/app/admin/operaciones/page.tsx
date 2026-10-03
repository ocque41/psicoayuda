import { asc, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  reviewProfessional,
  reviewScope,
  revokeScope,
} from "@/app/admin/operaciones/actions";
import { PracticeForm } from "@/components/practice/forms";
import { SupportTicketList } from "@/components/support/list";
import { db } from "@/db";
import { practiceCredentials, professionals } from "@/db/schema";
import { countries } from "@/lib/constants";
import { requirePracticeStaff } from "@/lib/practice/staff";
import { requireSupportStaff } from "@/lib/practice/support-access";
import { readStaffSupportList } from "@/lib/practice/support-queries";
export const metadata: Metadata = {
  title: "Operaciones profesionales",
  robots: { index: false, follow: false },
};
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; pagina?: string }>;
}) {
  const [support, reviewer] = await Promise.all([
    requireSupportStaff(),
    requirePracticeStaff("credentials"),
  ]);
  if (!support && !reviewer) redirect("/pro");
  const query = await searchParams;
  const [tickets, pros, scopes] = await Promise.all([
    support
      ? readStaffSupportList(support, {
          status: query.estado || "new",
          page: query.pagina,
        })
      : null,
    reviewer
      ? db
          .select({
            id: professionals.id,
            name: professionals.fullName,
            status: professionals.status,
            nonClinical: professionals.nonClinicalHelper,
            university: professionals.university,
            licenseNumber: professionals.licenseNumber,
            licenseCountry: professionals.licenseCountry,
            fpvNumber: professionals.fpvNumber,
            fpvVerified: professionals.fpvVerified,
            registrationType: professionals.registrationType,
            registrationDetail: professionals.registrationDetail,
            proof: sql<boolean>`${professionals.registrationProofDoc} IS NOT NULL`,
          })
          .from(professionals)
          .orderBy(asc(professionals.fullName))
      : [],
    reviewer
      ? db
          .select()
          .from(practiceCredentials)
          .orderBy(asc(practiceCredentials.expiresAt))
      : [],
  ]);
  return (
    <section className="section">
      <div className="container practice-shell">
        <p className="eyebrow">Espacio privado del equipo</p>
        <h1>Verificación y soporte</h1>
        <p>
          Consulta el mensaje, resuelve el siguiente paso y registra la
          respuesta. Cada acción queda en la auditoría.
        </p>
        <p>
          <Link href="/admin">Administración general</Link>
        </p>
        {support && tickets ? (
          <section>
            <h2>Soporte</h2>
            <p className="hint">
              Abre una consulta para revisar el historial, responder y registrar
              su estado.
            </p>
            <SupportTicketList
              list={tickets}
              basePath="/admin/operaciones"
              detailPath="/admin/operaciones/soporte"
              staff
            />
          </section>
        ) : null}
        {reviewer ? (
          <section>
            <h2>Credenciales y seguimiento</h2>
            {pros
              .filter((p) => !p.nonClinical)
              .map((p) => (
                <details className="card" key={p.id}>
                  <summary>
                    {p.name} ·{" "}
                    {{
                      approved: "Aprobado",
                      pending_verification: "Pendiente de revisión",
                      suspended: "Suspendido",
                      rejected: "Rechazado",
                      deleting: "Eliminación pendiente",
                    }[
                      p.status as
                        | "approved"
                        | "pending_verification"
                        | "suspended"
                        | "rejected"
                        | "deleting"
                    ] || "En revisión"}
                  </summary>
                  <dl>
                    <dt>Universidad</dt>
                    <dd>{p.university || "Pendiente"}</dd>
                    <dt>Registro</dt>
                    <dd>
                      {p.licenseCountry} ·{" "}
                      {p.licenseNumber || p.fpvNumber || "Pendiente"}
                    </dd>
                    <dt>Tipo y referencia</dt>
                    <dd>
                      {p.registrationType} · {p.registrationDetail}
                    </dd>
                    <dt>Consulta automática FPV</dt>
                    <dd>
                      {p.fpvVerified
                        ? "Coincidencia encontrada; cotejar alcance y vigencia"
                        : "Requiere cotejo manual"}
                    </dd>
                  </dl>
                  {p.proof ? (
                    <a
                      href={`/api/practice/credential/${p.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir comprobante privado
                    </a>
                  ) : (
                    <p>Sin comprobante adjunto.</p>
                  )}
                  {p.status === "deleting" ? (
                    <p role="status">
                      Esta cuenta está en proceso de eliminación. Conserva sus
                      referencias hasta completar la baja; no admite nuevas
                      decisiones de revisión.
                    </p>
                  ) : (
                    <PracticeForm
                      action={reviewProfessional}
                      submit="Guardar decisión"
                    >
                      <input type="hidden" name="professionalId" value={p.id} />
                      <label>
                        Decisión
                        <select name="status">
                          <option value="approved">Aprobar</option>
                          <option value="pending_verification">
                            Solicitar revisión
                          </option>
                          <option value="suspended">Suspender</option>
                          <option value="rejected">Rechazar</option>
                        </select>
                      </label>
                      <label>
                        Referencia de la decisión
                        <input
                          name="reference"
                          required
                          minLength={5}
                          maxLength={300}
                        />
                      </label>
                      <label className="practice-check">
                        <input type="checkbox" name="checked" required />
                        He revisado identidad, formación, registro y condiciones
                        de ejercicio. La aprobación requiere cotejo documental.
                      </label>
                    </PracticeForm>
                  )}
                </details>
              ))}
            <h2>Ámbitos de atención</h2>
            <p>
              Verifica la identidad, credencial vigente y requisitos para
              atender a personas en cada país. El país de residencia por sí solo
              no habilita la práctica.
            </p>
            <div className="practice-columns">
              <section className="card">
                <h3>Registrar revisión</h3>
                <PracticeForm action={reviewScope}>
                  <label>
                    Profesional
                    <select name="professionalId" required>
                      {pros
                        .filter(
                          (p) => p.status === "approved" && !p.nonClinical,
                        )
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    País donde recibe atención el paciente
                    <select name="country">
                      {countries.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Referencia interna de la revisión (registro y alcance)
                    <input
                      name="registryReference"
                      required
                      minLength={5}
                      maxLength={300}
                    />
                  </label>
                  <label>
                    Revisar de nuevo antes del
                    <input type="date" name="expiresAt" required />
                  </label>
                  <label className="practice-check">
                    <input name="checked" type="checkbox" required />
                    He cotejado la habilitación y las condiciones de atención en
                    este país.
                  </label>
                </PracticeForm>
              </section>
              <section>
                <h3>Próximas revisiones</h3>
                {scopes.map((s) => (
                  <article className="card" key={s.id}>
                    <strong>
                      {pros.find((p) => p.id === s.professionalId)?.name ||
                        "Profesional"}
                    </strong>
                    <p>
                      {s.patientCountry} ·{" "}
                      {new Intl.DateTimeFormat("es", {
                        timeZone: "UTC",
                        dateStyle: "medium",
                      }).format(new Date(s.expiresAt))}
                    </p>
                    <small>
                      {Date.parse(s.expiresAt) < Date.now()
                        ? "Revisión vencida: excluido de recomendaciones"
                        : "Ámbito vigente"}
                    </small>
                    {Date.parse(s.expiresAt) > Date.now() ? (
                      <details>
                        <summary>Retirar ámbito</summary>
                        <PracticeForm action={revokeScope} submit="Retirar">
                          <input type="hidden" name="scopeId" value={s.id} />
                          <label>
                            Motivo
                            <input
                              name="reason"
                              minLength={5}
                              maxLength={300}
                              required
                            />
                          </label>
                        </PracticeForm>
                      </details>
                    ) : null}
                  </article>
                ))}
                <p>
                  <Link href="/admin#profesionales">
                    Revisar solicitudes de alta y documentos →
                  </Link>
                </p>
              </section>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
