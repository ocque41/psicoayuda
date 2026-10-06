import "server-only";
import { and, eq, SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  admissionCases,
  admissionConfiguration,
  admissionEvents,
  auditLogs,
  practiceCredentials,
  professionals,
} from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { localToUtc } from "@/lib/practice/domain";
import { currentAdmissionReviewer, pendingAdmissionCandidate } from "./access";
import { currentScopeGate, readAdmissionConfiguration } from "./queries";
import type { AdmissionFormState, AdmissionReviewer } from "./types";
import {
  admissionMutationSchema,
  admissionReviewSchema,
  admissionScopeSchema,
  parseAdmissionStages,
  requiredAdmissionReference,
} from "./validation";

type MutationInput = {
  professionalId: string;
  revision: number;
  configRevision: number;
  profileRevision: string;
};
type CaseChanges = Partial<typeof admissionCases.$inferInsert>;
function aliasedFields<Fields extends Record<string, unknown>>(fields: Fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [
      key,
      field instanceof SQL ? field.as(key) : field,
    ]),
  ) as {
    [Key in keyof Fields]: Fields[Key] extends SQL<infer Value>
      ? SQL.Aliased<Value>
      : Fields[Key];
  };
}
const invalid = (
  message = "Revisa los campos y la referencia de cotejo.",
  field?: AdmissionFormState["field"],
): AdmissionFormState => ({
  ok: false,
  code: "invalid",
  message,
  ...(field ? { field } : {}),
});
const conflict = (): AdmissionFormState => ({
  ok: false,
  code: "conflict",
  message:
    "La candidatura, el perfil o las etapas cambiaron. Actualiza la ficha y revisa antes de guardar.",
});
const unavailable = (): AdmissionFormState => ({
  ok: false,
  code: "unavailable",
  message:
    "No se pudo guardar. Tus cambios siguen en el formulario; vuelve a intentarlo.",
});
const value = (form: FormData, key: string) =>
  typeof form.get(key) === "string" ? String(form.get(key)) : "";
function candidateInput(form: FormData) {
  return {
    professionalId: value(form, "professionalId"),
    revision: value(form, "revision"),
    configRevision: value(form, "configRevision"),
    profileRevision: value(form, "profileRevision"),
  };
}
function writeGuard(actor: AdmissionReviewer, input: MutationInput) {
  return and(
    currentAdmissionReviewer(actor),
    pendingAdmissionCandidate(input.professionalId),
    sql`EXISTS(SELECT 1 FROM professionals WHERE id=${input.professionalId} AND updated_at=${input.profileRevision})`,
    sql`EXISTS(SELECT 1 FROM admission_configuration WHERE id='default' AND revision=${input.configRevision})`,
  );
}
function eventProof(input: MutationInput, eventId: string) {
  return and(
    eq(admissionCases.professionalId, input.professionalId),
    eq(admissionCases.revision, input.revision + 1),
    eq(admissionCases.lastEventId, eventId),
  );
}
function caseWrite(
  actor: AdmissionReviewer,
  input: MutationInput,
  eventId: string,
  timestamp: string,
  firstStage: string,
  changes: CaseChanges,
  extra?: SQL,
) {
  if (input.revision > 0)
    return db
      .update(admissionCases)
      .set({
        ...changes,
        revision: input.revision + 1,
        configRevision: input.configRevision,
        lastEventId: eventId,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(admissionCases.professionalId, input.professionalId),
          eq(admissionCases.revision, input.revision),
          writeGuard(actor, input),
          extra,
        ),
      )
      .returning({ revision: admissionCases.revision });
  const initial = {
    professionalId: input.professionalId,
    stageId: firstStage,
    profileRevision: input.profileRevision,
    identityChecked: false,
    identityReference: "",
    credentialsChecked: false,
    credentialsReference: "",
    interviewAt: null,
    interviewTimeZone: "UTC",
    interviewReference: "",
    interviewCompleted: false,
    ...changes,
    revision: 1,
    configRevision: input.configRevision,
    lastEventId: eventId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const columns = Object.fromEntries(
    Object.entries(initial).map(([key, field]) => [
      key,
      sql`${typeof field === "boolean" ? Number(field) : field}`.as(key),
    ]),
  ) as { [Key in keyof typeof initial]: SQL.Aliased };
  return db
    .insert(admissionCases)
    .select(
      db
        .select(columns)
        .from(professionals)
        .where(
          and(
            eq(professionals.id, input.professionalId),
            writeGuard(actor, input),
            extra,
          ),
        ),
    )
    .onConflictDoNothing()
    .returning({ revision: admissionCases.revision });
}
function candidateEvent(
  actor: AdmissionReviewer,
  input: MutationInput,
  eventId: string,
  timestamp: string,
  action: string,
  summary: string,
  metadata: Record<string, unknown> = {},
  successProof: SQL = sql`1`,
) {
  // A successful case CAS must have the required child write. NULL violates the
  // event's NOT NULL constraint, rolling back the entire batch on a late failure.
  return db.insert(admissionEvents).select(
    db
      .select(
        aliasedFields({
          id: sql<string>`${eventId}`,
          professionalId: admissionCases.professionalId,
          revision: sql<number>`CASE WHEN ${successProof} THEN ${admissionCases.revision} ELSE NULL END`,
          configRevision: admissionCases.configRevision,
          actorUserId: sql<string>`${actor.userId}`,
          action: sql<string>`${action}`,
          summary: sql<string>`${summary}`,
          metadata: sql<string>`${JSON.stringify(metadata)}`,
          createdAt: sql<string>`${timestamp}`,
        }),
      )
      .from(admissionCases)
      .where(eventProof(input, eventId)),
  );
}
function eventAudit(
  actor: AdmissionReviewer,
  eventId: string,
  timestamp: string,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  return db.insert(auditLogs).select(
    db
      .select(
        aliasedFields({
          id: sql<string>`${newId("audit")}`,
          actorEmail: sql<string>`${actor.email}`,
          action: sql<string>`${action}`,
          entityType: sql<string>`'admission'`,
          entityId: sql<string>`${entityId}`,
          metadata: sql<string>`${JSON.stringify(metadata)}`,
          createdAt: sql<string>`${timestamp}`,
        }),
      )
      .from(admissionEvents)
      .where(eq(admissionEvents.id, eventId)),
  );
}
async function configurationFor(
  input: MutationInput,
  actor: AdmissionReviewer,
) {
  const config = await readAdmissionConfiguration(actor);
  return config.revision === input.configRevision ? config : null;
}

export async function saveAdmissionReview(
  actor: AdmissionReviewer,
  form: FormData,
): Promise<AdmissionFormState> {
  const parsed = admissionReviewSchema.safeParse({
    ...candidateInput(form),
    identityChecked: form.get("identityChecked") === "on",
    identityReference: value(form, "identityReference"),
    credentialsChecked: form.get("credentialsChecked") === "on",
    credentialsReference: value(form, "credentialsReference"),
    interviewLocal: value(form, "interviewLocal"),
    interviewTimeZone: value(form, "interviewTimeZone"),
    interviewReference: value(form, "interviewReference"),
    interviewCompleted: form.get("interviewCompleted") === "on",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return invalid(
      issue?.message,
      field === "interviewLocal" ||
        field === "interviewTimeZone" ||
        field === "interviewReference"
        ? field
        : undefined,
    );
  }
  const input = parsed.data;
  const interviewAt = input.interviewLocal
    ? localToUtc(input.interviewLocal, input.interviewTimeZone)
    : null;
  if (input.interviewLocal && !interviewAt)
    return invalid(
      "Revisa la fecha y zona horaria; evita horas inexistentes o ambiguas por cambios de horario.",
      "interviewLocal",
    );
  if (
    input.interviewCompleted &&
    (!interviewAt || Date.parse(interviewAt) > Date.now())
  )
    return invalid(
      "Una entrevista realizada debe tener una fecha pasada o actual.",
      "interviewLocal",
    );
  try {
    const config = await configurationFor(input, actor);
    if (!config) return conflict();
    const eventId = newId("admission"),
      timestamp = nowIso();
    const [written] = await db.batch([
      caseWrite(actor, input, eventId, timestamp, config.stages[0].id, {
        profileRevision: input.profileRevision,
        identityChecked: input.identityChecked,
        identityReference: input.identityReference,
        credentialsChecked: input.credentialsChecked,
        credentialsReference: input.credentialsReference,
        interviewAt,
        interviewTimeZone: input.interviewTimeZone,
        interviewReference: input.interviewReference,
        interviewCompleted: input.interviewCompleted,
      }),
      candidateEvent(
        actor,
        input,
        eventId,
        timestamp,
        "review_saved",
        "Cotejos y entrevista guardados.",
        {
          identity: input.identityChecked,
          credentials: input.credentialsChecked,
          interview: input.interviewCompleted,
          identityReference: input.identityReference,
          credentialsReference: input.credentialsReference,
          interviewAt,
          interviewTimeZone: input.interviewTimeZone,
          interviewReference: input.interviewReference,
          profileRevision: input.profileRevision,
        },
      ),
      eventAudit(
        actor,
        eventId,
        timestamp,
        "admission_review_saved",
        input.professionalId,
      ),
    ]);
    return written.length
      ? { ok: true, message: "Revisión guardada." }
      : conflict();
  } catch {
    return unavailable();
  }
}

export async function saveAdmissionScope(
  actor: AdmissionReviewer,
  form: FormData,
): Promise<AdmissionFormState> {
  const parsed = admissionScopeSchema.safeParse({
    ...candidateInput(form),
    country: value(form, "country"),
    registryReference: value(form, "registryReference"),
    expiresAt: value(form, "expiresAt"),
    checked: value(form, "checked"),
  });
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
  const input = parsed.data,
    expiresAt = `${input.expiresAt}T23:59:59.999Z`;
  const expiry = Date.parse(expiresAt);
  if (
    !Number.isFinite(expiry) ||
    new Date(expiry).toISOString() !== expiresAt ||
    expiry <= Date.now() ||
    expiry > Date.now() + 366 * 86_400_000
  )
    return invalid(
      "El ámbito debe vencer en una fecha válida dentro de los próximos doce meses.",
    );
  try {
    const config = await configurationFor(input, actor);
    if (!config) return conflict();
    const eventId = newId("admission"),
      timestamp = nowIso();
    const scopeWritten = sql`EXISTS(SELECT 1 FROM practice_credentials WHERE professional_id=${input.professionalId} AND patient_country=${input.country} AND reviewed_at=${timestamp} AND expires_at=${expiresAt} AND registry_reference=${input.registryReference})`;
    const [written] = await db.batch([
      caseWrite(actor, input, eventId, timestamp, config.stages[0].id, {}),
      db
        .insert(practiceCredentials)
        .select(
          db
            .select(
              aliasedFields({
                id: sql<string>`${newId("scope")}`,
                professionalId: admissionCases.professionalId,
                patientCountry: sql<string>`${input.country}`,
                registryReference: sql<string>`${input.registryReference}`,
                reviewedBy: sql<string>`${actor.email}`,
                reviewedAt: sql<string>`${timestamp}`,
                expiresAt: sql<string>`${expiresAt}`,
              }),
            )
            .from(admissionCases)
            .where(eventProof(input, eventId)),
        )
        .onConflictDoUpdate({
          target: [
            practiceCredentials.professionalId,
            practiceCredentials.patientCountry,
          ],
          set: {
            registryReference: input.registryReference,
            reviewedBy: actor.email,
            reviewedAt: timestamp,
            expiresAt,
          },
        }),
      candidateEvent(
        actor,
        input,
        eventId,
        timestamp,
        "scope_verified",
        `Ámbito de atención verificado: ${input.country}.`,
        {
          country: input.country,
          expiresAt,
          registryReference: input.registryReference,
        },
        scopeWritten,
      ),
      eventAudit(
        actor,
        eventId,
        timestamp,
        "admission_scope_verified",
        input.professionalId,
        { country: input.country },
      ),
    ]);
    return written.length
      ? { ok: true, message: "Ámbito de atención verificado y guardado." }
      : conflict();
  } catch {
    return unavailable();
  }
}

function gatePredicate(gate: string, input: MutationInput) {
  const current = eq(admissionCases.profileRevision, input.profileRevision);
  if (gate === "identity")
    return (
      and(
        current,
        eq(admissionCases.identityChecked, true),
        sql`length(trim(${admissionCases.identityReference}))>=5`,
      ) ?? sql`0`
    );
  if (gate === "credentials")
    return (
      and(
        current,
        eq(admissionCases.credentialsChecked, true),
        sql`length(trim(${admissionCases.credentialsReference}))>=5`,
      ) ?? sql`0`
    );
  if (gate === "scope") return currentScopeGate(input.professionalId);
  if (gate === "interview")
    return (
      and(
        current,
        eq(admissionCases.interviewCompleted, true),
        sql`${admissionCases.interviewAt} IS NOT NULL AND ${admissionCases.interviewAt} <= strftime('%Y-%m-%dT%H:%M:%fZ','now') AND length(trim(${admissionCases.interviewReference}))>=5`,
      ) ?? sql`0`
    );
  return sql`1`;
}
export async function moveAdmissionStage(
  actor: AdmissionReviewer,
  form: FormData,
): Promise<AdmissionFormState> {
  const parsed = admissionMutationSchema.safeParse(candidateInput(form));
  const reference = requiredAdmissionReference.safeParse(
    value(form, "reference"),
  );
  if (!parsed.success || !reference.success) return invalid();
  const input = parsed.data;
  try {
    const config = await configurationFor(input, actor);
    if (!config) return conflict();
    const [currentCase] = await db
      .select({ stageId: admissionCases.stageId })
      .from(admissionCases)
      .where(
        and(
          eq(admissionCases.professionalId, input.professionalId),
          eq(admissionCases.revision, input.revision),
          writeGuard(actor, input),
        ),
      )
      .limit(1);
    if (input.revision > 0 && !currentCase) return conflict();
    const from = config.stages.findIndex(
      (stage) => stage.id === (currentCase?.stageId || config.stages[0].id),
    );
    const target = config.stages.findIndex(
      (stage) => stage.id === value(form, "stageId"),
    );
    if (from < 0 || target < 0 || target === from)
      return invalid("Elige otra etapa del recorrido.");
    const passed =
      target > from
        ? config.stages
            .slice(0, target)
            .filter((stage) => stage.core && stage.id !== "publication")
        : [];
    // Initial movement cannot skip a protected gate; the first review creates the case.
    if (input.revision === 0 && passed.length)
      return {
        ok: false,
        code: "blocked",
        message: "Guarda el cotejo requerido antes de avanzar de etapa.",
      };
    const eventId = newId("admission"),
      timestamp = nowIso();
    const [written] = await db.batch([
      caseWrite(
        actor,
        input,
        eventId,
        timestamp,
        config.stages[0].id,
        { stageId: config.stages[target].id },
        and(...passed.map((stage) => gatePredicate(stage.id, input))),
      ),
      candidateEvent(
        actor,
        input,
        eventId,
        timestamp,
        target > from ? "stage_advanced" : "stage_returned",
        `Etapa: ${config.stages[target].label}. ${reference.data}`,
        { from: config.stages[from].id, to: config.stages[target].id },
      ),
      eventAudit(
        actor,
        eventId,
        timestamp,
        "admission_stage_changed",
        input.professionalId,
        { from: config.stages[from].id, to: config.stages[target].id },
      ),
    ]);
    return written.length
      ? { ok: true, message: "Etapa actualizada." }
      : {
          ok: false,
          code: "blocked",
          message:
            "No se pudo avanzar. Completa los cotejos previos o actualiza una ficha que haya cambiado.",
        };
  } catch {
    return unavailable();
  }
}

export async function publishAdmissionCandidate(
  actor: AdmissionReviewer,
  form: FormData,
): Promise<AdmissionFormState> {
  const parsed = admissionMutationSchema.safeParse(candidateInput(form));
  const reference = requiredAdmissionReference.safeParse(
    value(form, "reference"),
  );
  if (!parsed.success || !reference.success || form.get("confirm") !== "on")
    return invalid(
      "Confirma explícitamente la publicación y añade una referencia de la revisión final.",
    );
  const input = parsed.data;
  if (input.revision === 0)
    return {
      ok: false,
      code: "blocked",
      message: "Completa primero la revisión de admisión.",
    };
  try {
    const config = await configurationFor(input, actor);
    if (!config) return conflict();
    const eventId = newId("admission"),
      timestamp = nowIso();
    const finalGate = and(
      eq(admissionCases.stageId, "publication"),
      ...["identity", "credentials", "scope", "interview"].map((gate) =>
        gatePredicate(gate, input),
      ),
      sql`EXISTS(SELECT 1 FROM professionals p JOIN user u ON u.id=p.user_id WHERE p.id=${input.professionalId} AND p.conduct_accepted_at IS NOT NULL AND u.email_verified=1)`,
    );
    const publicationProof = sql`EXISTS(SELECT 1 FROM professionals p JOIN user u ON u.id=p.user_id WHERE p.id=${input.professionalId} AND p.status='approved' AND p.credential_confirmed=1 AND p.updated_at=${timestamp} AND p.conduct_accepted_at IS NOT NULL AND u.email_verified=1) AND ${currentScopeGate(input.professionalId)}`;
    const [written] = await db.batch([
      caseWrite(
        actor,
        input,
        eventId,
        timestamp,
        config.stages[0].id,
        {},
        finalGate,
      ),
      db
        .update(professionals)
        .set({
          status: "approved",
          credentialConfirmed: true,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(professionals.id, input.professionalId),
            writeGuard(actor, input),
            sql`EXISTS(SELECT 1 FROM admission_cases WHERE professional_id=${input.professionalId} AND last_event_id=${eventId} AND revision=${input.revision + 1} AND ${finalGate})`,
          ),
        )
        .returning({ id: professionals.id }),
      candidateEvent(
        actor,
        input,
        eventId,
        timestamp,
        "published",
        `Publicación confirmada. ${reference.data}`,
        {},
        publicationProof,
      ),
      eventAudit(
        actor,
        eventId,
        timestamp,
        "admission_published",
        input.professionalId,
      ),
    ]);
    return written.length
      ? {
          ok: true,
          published: true,
          message:
            "Profesional publicado. Su perfil conserva sus preferencias de atención y visibilidad.",
        }
      : {
          ok: false,
          code: "blocked",
          message:
            "La publicación requiere todos los cotejos, ámbitos vigentes, entrevista realizada, condiciones aceptadas y un perfil sin cambios pendientes.",
        };
  } catch {
    return unavailable();
  }
}

export async function configureAdmissionStages(
  actor: AdmissionReviewer,
  form: FormData,
): Promise<AdmissionFormState> {
  const stages = parseAdmissionStages(value(form, "stagesJSON"));
  const reference = requiredAdmissionReference.safeParse(
    value(form, "reference"),
  );
  const revision = Number(value(form, "configRevision"));
  if (
    !stages ||
    !reference.success ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    revision > 1_000_000
  )
    return invalid(
      "Conserva las cinco etapas obligatorias y deja Publicación al final. Añade una referencia del cambio.",
    );
  try {
    const eventId = newId("admission"),
      timestamp = nowIso();
    const usedStageRemoved = sql`EXISTS(SELECT 1 FROM admission_cases c WHERE c.stage_id NOT IN (${sql.join(
      stages.map((stage) => sql`${stage.id}`),
      sql`, `,
    )}))`;
    const [written] = await db.batch([
      db
        .update(admissionConfiguration)
        .set({
          stagesJson: JSON.stringify(stages),
          revision: revision + 1,
          lastEventId: eventId,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(admissionConfiguration.id, "default"),
            eq(admissionConfiguration.revision, revision),
            currentAdmissionReviewer(actor),
            sql`NOT ${usedStageRemoved}`,
          ),
        )
        .returning({ revision: admissionConfiguration.revision }),
      db.insert(admissionEvents).select(
        db
          .select(
            aliasedFields({
              id: sql<string>`${eventId}`,
              professionalId: sql<string | null>`NULL`,
              revision: admissionConfiguration.revision,
              configRevision: admissionConfiguration.revision,
              actorUserId: sql<string>`${actor.userId}`,
              action: sql<string>`'configuration_changed'`,
              summary: sql<string>` ${`Etapas actualizadas. ${reference.data}`}`,
              metadata: sql<string>`${JSON.stringify({ stages, reference: reference.data })}`,
              createdAt: sql<string>`${timestamp}`,
            }),
          )
          .from(admissionConfiguration)
          .where(
            and(
              eq(admissionConfiguration.id, "default"),
              eq(admissionConfiguration.lastEventId, eventId),
            ),
          ),
      ),
      eventAudit(
        actor,
        eventId,
        timestamp,
        "admission_configuration_changed",
        "default",
        { stages: stages.map((stage) => stage.id) },
      ),
    ]);
    return written.length
      ? {
          ok: true,
          message:
            "Etapas actualizadas; los cotejos obligatorios se conservan.",
        }
      : {
          ok: false,
          code: "conflict",
          message:
            "La configuración cambió o una etapa retirada todavía tiene candidaturas. Actualiza el tablero y mueve primero esas candidaturas.",
        };
  } catch {
    return unavailable();
  }
}
