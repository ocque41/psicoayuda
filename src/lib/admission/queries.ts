import "server-only";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import {
  adminRequestPage,
  adminSearchValue,
} from "@/components/admin/search-params";
import { db } from "@/db";
import {
  admissionCases,
  admissionConfiguration,
  admissionEvents,
  practiceCredentials,
  professionalScreenings,
  professionals,
  user,
} from "@/db/schema";
import {
  sanitizeScreeningAnswers,
  screeningReview,
} from "@/lib/screening/scoring";
import { currentAdmissionReviewer } from "./access";
import { admissionHistoryDetails } from "./history";
import type {
  AdmissionBoardData,
  AdmissionCandidate,
  AdmissionDetail,
  AdmissionReviewer,
} from "./types";
import { parseAdmissionStages } from "./validation";

export const ADMISSION_PAGE_SIZE = 25;
export async function readAdmissionConfiguration(actor: AdmissionReviewer) {
  const [row] = await db
    .select()
    .from(admissionConfiguration)
    .where(
      and(
        eq(admissionConfiguration.id, "default"),
        currentAdmissionReviewer(actor),
      ),
    )
    .limit(1);
  const stages = row ? parseAdmissionStages(row.stagesJson) : null;
  if (!row || !stages) throw new Error("admission_configuration_unavailable");
  return { stages, revision: row.revision };
}

/**
 * Toda solicitud pendiente se revisa en Admisión: la clínica y la de apoyo
 * voluntario. Lo que cambia es lo que exige su aceptación.
 */
export const candidateEligibility = () =>
  eq(professionals.status, "pending_verification");
export const currentScopeGate = (
  professionalId: string | typeof professionals.id,
) =>
  sql<boolean>`EXISTS (SELECT 1 FROM practice_credentials WHERE professional_id=${professionalId} AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now') AND length(trim(registry_reference)) >= 5)`;
const candidateColumns = {
  professionalId: professionals.id,
  name: professionals.fullName,
  email: professionals.email,
  country: professionals.country,
  licenseCountry: professionals.licenseCountry,
  createdAt: professionals.createdAt,
  professionalUpdatedAt: professionals.updatedAt,
  hasDocument: sql<boolean>`${professionals.registrationProofDoc} IS NOT NULL AND ${professionals.registrationProofDoc} <> ''`,
  volunteer: professionals.nonClinicalHelper,
  conductAcceptedAt: professionals.conductAcceptedAt,
  candidateEmailVerified: user.emailVerified,
  stageId: admissionCases.stageId,
  revision: admissionCases.revision,
  updatedAt: admissionCases.updatedAt,
  reviewProfileRevision: admissionCases.profileRevision,
  identityChecked: admissionCases.identityChecked,
  identityReference: admissionCases.identityReference,
  credentialsChecked: admissionCases.credentialsChecked,
  credentialsReference: admissionCases.credentialsReference,
  interviewAt: admissionCases.interviewAt,
  interviewTimeZone: admissionCases.interviewTimeZone,
  interviewReference: admissionCases.interviewReference,
  interviewCompleted: admissionCases.interviewCompleted,
  scopeValid: currentScopeGate(professionals.id),
  screeningSubmittedAt: professionalScreenings.submittedAt,
  screeningScore: professionalScreenings.score,
  screeningMaxScore: professionalScreenings.maxScore,
  screeningFlags: professionalScreenings.flagsJson,
};
function flagList(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed)
      ? (parsed as { number: number; reason: string }[])
      : [];
  } catch {
    return [];
  }
}
type CandidateRow = { [Key in keyof typeof candidateColumns]: unknown };
function candidateFromRow(
  row: CandidateRow,
  firstStage: string,
): AdmissionCandidate {
  const reviewCurrent = row.reviewProfileRevision === row.professionalUpdatedAt;
  const identity = Boolean(
    reviewCurrent &&
      row.identityChecked &&
      String(row.identityReference || "").trim().length >= 5,
  );
  const credentials = Boolean(
    reviewCurrent &&
      row.credentialsChecked &&
      String(row.credentialsReference || "").trim().length >= 5,
  );
  const interview = Boolean(
    reviewCurrent &&
      row.interviewCompleted &&
      row.interviewAt &&
      Date.parse(String(row.interviewAt)) <= Date.now() &&
      String(row.interviewReference || "").trim().length >= 5,
  );
  const scope = Boolean(row.scopeValid);
  const stageId = String(row.stageId || firstStage);
  const screeningSubmitted = Boolean(row.screeningSubmittedAt);
  const volunteer = Boolean(row.volunteer);
  const accountReady =
    Boolean(row.conductAcceptedAt) && Boolean(row.candidateEmailVerified);
  return {
    professionalId: String(row.professionalId),
    name: String(row.name),
    email: String(row.email),
    country: typeof row.country === "string" ? row.country : null,
    licenseCountry:
      typeof row.licenseCountry === "string" ? row.licenseCountry : null,
    stageId,
    revision: Number(row.revision || 0),
    profileRevision: String(row.professionalUpdatedAt),
    updatedAt: String(
      row.updatedAt || row.professionalUpdatedAt || row.createdAt,
    ),
    hasDocument: Boolean(row.hasDocument),
    volunteer,
    gates: { identity, credentials, scope, interview },
    screening: {
      submitted: screeningSubmitted,
      score: screeningSubmitted ? Number(row.screeningScore ?? 0) : null,
      maxScore: screeningSubmitted ? Number(row.screeningMaxScore ?? 0) : null,
      flagCount: screeningSubmitted ? flagList(row.screeningFlags).length : 0,
    },
    canPublish: volunteer
      ? screeningSubmitted && accountReady
      : screeningSubmitted &&
        identity &&
        credentials &&
        scope &&
        interview &&
        stageId === "publication" &&
        accountReady,
  };
}

function localInput(utc: string | null, zone: string) {
  if (!utc || !Number.isFinite(Date.parse(utc))) return "";
  try {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(new Date(utc))
      .replace(" ", "T");
  } catch {
    return "";
  }
}

export async function readAdmissionBoard(
  actor: AdmissionReviewer,
  query: Record<string, string | string[] | undefined>,
): Promise<AdmissionBoardData> {
  const config = await readAdmissionConfiguration(actor);
  const firstStage = config.stages[0].id;
  const page = adminRequestPage(adminSearchValue(query.pagina));
  const historyPage = adminRequestPage(adminSearchValue(query.historial));
  const term = (adminSearchValue(query.q) || "").trim().slice(0, 80);
  const requestedStage = adminSearchValue(query.etapa) || "";
  const stageFilter = config.stages.some((stage) => stage.id === requestedStage)
    ? requestedStage
    : "";
  const stageExpression = sql<string>`coalesce(${admissionCases.stageId}, ${firstStage})`;
  const filter = term
    ? sql`(${professionals.fullName} LIKE ${`%${term.replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\' OR ${professionals.email} LIKE ${`%${term.replace(/[\\%_]/g, "\\$&")}%`} ESCAPE '\\')`
    : undefined;
  const [rows, counts] = await Promise.all([
    db
      .select(candidateColumns)
      .from(professionals)
      .innerJoin(user, eq(user.id, professionals.userId))
      .leftJoin(
        admissionCases,
        eq(admissionCases.professionalId, professionals.id),
      )
      .leftJoin(
        professionalScreenings,
        eq(professionalScreenings.professionalId, professionals.id),
      )
      .where(
        and(
          candidateEligibility(),
          currentAdmissionReviewer(actor),
          filter,
          stageFilter ? eq(stageExpression, stageFilter) : undefined,
        ),
      )
      .orderBy(asc(professionals.createdAt), asc(professionals.id))
      .limit(ADMISSION_PAGE_SIZE + 1)
      .offset((page - 1) * ADMISSION_PAGE_SIZE),
    db
      .select({ stageId: stageExpression, total: count() })
      .from(professionals)
      .leftJoin(
        admissionCases,
        eq(admissionCases.professionalId, professionals.id),
      )
      .where(and(candidateEligibility(), currentAdmissionReviewer(actor)))
      .groupBy(stageExpression),
  ]);
  const candidates = rows
    .slice(0, ADMISSION_PAGE_SIZE)
    .map((row) => candidateFromRow(row, firstStage));
  const stageCounts = Object.fromEntries(
    config.stages.map((stage) => [
      stage.id,
      counts.find((row) => row.stageId === stage.id)?.total || 0,
    ]),
  );
  let selected: AdmissionDetail | null = null;
  const selectedId = (adminSearchValue(query.candidato) || "").slice(0, 120);
  if (selectedId) {
    const [detail] = await db
      .select({
        ...candidateColumns,
        university: professionals.university,
        licenseNumber: professionals.licenseNumber,
        fpvNumber: professionals.fpvNumber,
        fpvVerified: professionals.fpvVerified,
        registrationType: professionals.registrationType,
        registrationDetail: professionals.registrationDetail,
        screeningAnswers: professionalScreenings.answersJson,
        screeningExclusions: professionalScreenings.exclusions,
      })
      .from(professionals)
      .innerJoin(user, eq(user.id, professionals.userId))
      .leftJoin(
        admissionCases,
        eq(admissionCases.professionalId, professionals.id),
      )
      .leftJoin(
        professionalScreenings,
        eq(professionalScreenings.professionalId, professionals.id),
      )
      .where(
        and(
          eq(professionals.id, selectedId),
          candidateEligibility(),
          currentAdmissionReviewer(actor),
        ),
      )
      .limit(1);
    if (detail) {
      const [scopes, history] = await Promise.all([
        db
          .select()
          .from(practiceCredentials)
          .where(
            and(
              eq(practiceCredentials.professionalId, selectedId),
              currentAdmissionReviewer(actor),
              sql`EXISTS(SELECT 1 FROM professionals WHERE id=${selectedId} AND status='pending_verification')`,
            ),
          )
          .orderBy(asc(practiceCredentials.patientCountry))
          .limit(200),
        db
          .select({
            id: admissionEvents.id,
            professionalId: admissionEvents.professionalId,
            revision: admissionEvents.revision,
            actorUserId: admissionEvents.actorUserId,
            action: admissionEvents.action,
            createdAt: admissionEvents.createdAt,
            summary: sql<string>`substr(${admissionEvents.summary},1,400)`,
            metadata: sql<
              string | null
            >`CASE WHEN length(CAST(${admissionEvents.metadata} AS BLOB))<=8000 THEN ${admissionEvents.metadata} ELSE NULL END`,
          })
          .from(admissionEvents)
          .where(
            and(
              eq(admissionEvents.professionalId, selectedId),
              currentAdmissionReviewer(actor),
              sql`EXISTS(SELECT 1 FROM professionals WHERE id=${selectedId} AND status='pending_verification')`,
            ),
          )
          .orderBy(desc(admissionEvents.revision))
          .limit(ADMISSION_PAGE_SIZE + 1)
          .offset((historyPage - 1) * ADMISSION_PAGE_SIZE),
      ]);
      const summary = candidateFromRow(detail, firstStage);
      const blockers: string[] = [];
      const clinical = !summary.volunteer;
      if (
        clinical &&
        detail.reviewProfileRevision &&
        detail.reviewProfileRevision !== detail.professionalUpdatedAt
      )
        blockers.push(
          "El perfil cambió desde el último cotejo. Revisa nuevamente identidad, credenciales y entrevista.",
        );
      if (clinical && !summary.gates.identity)
        blockers.push("Completar el cotejo de identidad.");
      if (clinical && !summary.gates.credentials)
        blockers.push("Completar el cotejo documental de credenciales.");
      if (clinical && !summary.gates.scope)
        blockers.push("Registrar al menos un ámbito de atención vigente.");
      if (clinical && !summary.gates.interview)
        blockers.push(
          "Registrar una entrevista realizada con fecha y referencia.",
        );
      if (clinical && summary.stageId !== "publication")
        blockers.push("Llevar la candidatura a Revisión y publicación.");
      if (!detail.conductAcceptedAt)
        blockers.push(
          "La cuenta candidata debe aceptar las condiciones y el código de conducta.",
        );
      if (!detail.candidateEmailVerified)
        blockers.push("La cuenta candidata debe verificar su correo.");
      if (!summary.screening.submitted)
        blockers.push(
          "La cuenta candidata debe enviar el cuestionario de admisión.",
        );
      let screeningAnswers = {};
      try {
        screeningAnswers = sanitizeScreeningAnswers(
          JSON.parse(String(detail.screeningAnswers || "{}")),
        );
      } catch {}
      selected = {
        ...summary,
        profile: {
          university: detail.university,
          licenseNumber: detail.licenseNumber,
          fpvNumber: detail.fpvNumber,
          fpvVerified: detail.fpvVerified,
          registrationType: detail.registrationType,
          registrationDetail: detail.registrationDetail,
          conductAccepted: Boolean(detail.conductAcceptedAt),
        },
        screeningDetail: summary.screening.submitted
          ? {
              items: screeningReview(screeningAnswers),
              exclusions: detail.screeningExclusions || "",
              flags: flagList(detail.screeningFlags),
            }
          : null,
        evidence: {
          identity: detail.identityReference || "",
          credentials: detail.credentialsReference || "",
        },
        interview: {
          startsAt: detail.interviewAt,
          localDateTime: localInput(
            detail.interviewAt,
            detail.interviewTimeZone || "UTC",
          ),
          timeZone: detail.interviewTimeZone || "UTC",
          reference: detail.interviewReference || "",
          completed: summary.gates.interview,
        },
        scopes: scopes.map((scope) => ({
          id: scope.id,
          country: scope.patientCountry,
          reference: scope.registryReference,
          expiresAt: scope.expiresAt,
          reviewedAt: scope.reviewedAt,
          valid: Date.parse(scope.expiresAt) > Date.now(),
        })),
        history: history.slice(0, ADMISSION_PAGE_SIZE).map((event) => ({
          id: event.id,
          createdAt: event.createdAt,
          actorLabel:
            event.actorUserId === actor.userId ? "Tú" : "Equipo de admisión",
          action: event.action,
          summary: event.summary,
          details: admissionHistoryDetails(event.action, event.metadata),
        })),
        historyHasMore: history.length > ADMISSION_PAGE_SIZE,
        historyPage,
        publishBlockers: blockers,
      };
    }
  }
  return {
    stages: config.stages,
    configRevision: config.revision,
    candidates,
    selected,
    canConfigure: true,
    limitedReviewer: !actor.isAdmin,
    page,
    hasMore: rows.length > ADMISSION_PAGE_SIZE,
    query: term,
    stageFilter,
    stageCounts,
  };
}
