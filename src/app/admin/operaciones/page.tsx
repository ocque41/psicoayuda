import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  replySupport,
  reviewProfessional,
  reviewScope,
  revokeScope,
  updateSupportStatus,
} from "@/app/admin/operaciones/actions";
import { PracticeForm } from "@/components/practice/forms";
import { db } from "@/db";
import {
  contactMessages,
  practiceCredentials,
  professionals,
  supportReplies,
} from "@/db/schema";
import { countries } from "@/lib/constants";
import { contactCategoryLabels } from "@/lib/contact-messages";
import { dateLabel } from "@/lib/practice/domain";
import { orient } from "@/lib/practice/orientation";
import { requirePracticeStaff } from "@/lib/practice/staff";
export const metadata: Metadata = {
  title: "Operaciones profesionales",
  robots: { index: false, follow: false },
};
export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const [support, reviewer] = await Promise.all([
    requirePracticeStaff("support"),
    requirePracticeStaff("credentials"),
  ]);
  if (!support && !reviewer) redirect("/pro");
  const query = await searchParams;
  const [tickets, pros, scopes] = await Promise.all([
    support
      ? db
          .select()
          .from(contactMessages)
          .where(
            eq(
              contactMessages.status,
              ["new", "in_review", "resolved"].includes(query.estado || "")
                ? query.estado || "new"
                : "new",
            ),
          )
          .orderBy(asc(contactMessages.createdAt))
          .limit(50)
      : [],
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
  const replies =
    support && tickets.length
      ? await db
          .select()
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
        <p className="eyebrow">Espacio privado del equipo</p>
        <h1>Verificación y soporte</h1>
        <p>
          Consulta el mensaje, resuelve el siguiente paso y registra la
          respuesta. Cada acción queda en la auditoría.
        </p>
        <p>
          <Link href="/admin">Administración general</Link>
        </p>
        {support ? (
          <section>
            <h2>Soporte</h2>
            <nav className="panel-nav">
              <Link href="?estado=new">Nuevos</Link>
              <Link href="?estado=in_review">En revisión</Link>
              <Link href="?estado=resolved">Resueltos</Link>
            </nav>
            {tickets.map((t) => {
              const flags = orient({
                text: t.message,
                country: "Venezuela",
                language: "es",
                ageGroup: "adult",
                forWhom: "self",
                immediateDanger: "no",
              });
              return (
                <article className="card" key={t.id}>
                  <h3>
                    {t.name || "Contacto"} ·{" "}
                    {contactCategoryLabels[
                      t.category as keyof typeof contactCategoryLabels
                    ] || "Consulta"}
                  </h3>
                  <p className="hint">
                    {dateLabel(t.createdAt)} ·{" "}
                    {t.source === "professional_dashboard"
                      ? "Panel profesional"
                      : "Contacto público"}
                  </p>
                  {flags.safetySignal ? (
                    <p role="alert">
                      Hay una mención que requiere revisión humana prioritaria.
                      No confirmar seguridad a partir de esta señal automática.
                    </p>
                  ) : null}
                  <p style={{ whiteSpace: "pre-wrap" }}>{t.message}</p>
                  {replies
                    .filter((r) => r.contactId === t.id)
                    .map((r) => (
                      <div className="orientation-message" key={r.id}>
                        <p>{r.body}</p>
                        <small>{dateLabel(r.createdAt)}</small>
                      </div>
                    ))}
                  {t.professionalId ? (
                    <PracticeForm
                      action={replySupport}
                      submit="Publicar respuesta"
                    >
                      <input type="hidden" name="contactId" value={t.id} />
                      <label>
                        Respuesta en el panel del profesional
                        <textarea
                          name="body"
                          required
                          minLength={3}
                          maxLength={2000}
                          rows={4}
                        />
                      </label>
                      <label>
                        Estado
                        <select name="status">
                          <option value="in_review">En revisión</option>
                          <option value="resolved">Resuelto</option>
                        </select>
                      </label>
                    </PracticeForm>
                  ) : (
                    <div>
                      <a
                        href={`mailto:${encodeURIComponent(t.email)}?subject=Respuesta%20de%20Nido`}
                      >
                        Responder desde el correo
                      </a>
                      <PracticeForm
                        action={updateSupportStatus}
                        submit="Guardar estado"
                      >
                        <input type="hidden" name="contactId" value={t.id} />
                        <label>
                          Estado
                          <select name="status">
                            <option value="in_review">En revisión</option>
                            <option value="resolved">Resuelto</option>
                          </select>
                        </label>
                      </PracticeForm>
                    </div>
                  )}
                </article>
              );
            })}
            {!tickets.length ? <p>No hay mensajes en este estado.</p> : null}
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
