import "server-only";
import { and, asc, count, desc, eq, gte, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  patientAccounts,
  patientConversationLinks,
  patientSessionRequests,
} from "@/db/patient-schema";
import {
  conversations,
  practiceAppointments,
  practicePatients,
} from "@/db/schema";
import { localToUtc, timeZoneSchema } from "@/lib/practice/domain";
import { pageNumber } from "@/lib/practice/queries";

export const REQUEST_PAGE_SIZE = 20;
export const requestFilters = [
  ["pending", "Pendientes"],
  ["all", "Todos los estados"],
  ["confirmed", "Confirmadas"],
  ["reviewed", "Revisadas · seguir por chat"],
  ["declined", "No aceptadas"],
  ["withdrawn", "Retiradas"],
] as const;
export type RequestParameters = Record<string, string | undefined>;

function validDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
    ? value
    : "";
}

export function requestFilterValues(
  parameters: RequestParameters,
  timezone: string,
) {
  const state =
    requestFilters.find(
      ([value]) => value === parameters.solicitudes_estado,
    )?.[0] || "pending";
  const from = validDay(parameters.solicitudes_desde);
  const until = validDay(parameters.solicitudes_hasta);
  const nextDay = until
    ? new Date(Date.parse(`${until}T00:00:00Z`) + 86400000)
        .toISOString()
        .slice(0, 10)
    : "";
  const fromUtc = from ? localToUtc(`${from}T00:00`, timezone) : null;
  const untilUtc = until ? localToUtc(`${nextDay}T00:00`, timezone) : null;
  const invalid = Boolean(
    (parameters.solicitudes_desde && (!from || !fromUtc)) ||
      (parameters.solicitudes_hasta && (!until || !untilUtc)) ||
      (from && until && from > until),
  );
  return {
    state,
    from,
    until,
    fromUtc: invalid ? null : fromUtc,
    untilUtc: invalid ? null : untilUtc,
    error: invalid
      ? "No aplicamos las fechas: revisa que sean válidas y que el inicio no sea posterior al final."
      : null,
  };
}

export function requestPageHref(parameters: RequestParameters, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value) query.set(key, value);
  }
  query.set("solicitudes", String(page));
  return `/pro/consulta?${query}#solicitudes`;
}

/** El caller obtiene professionalId de requirePracticeProfessional, nunca de la URL. */
export async function professionalPatientRequests(
  professionalId: string,
  timezone: string,
  parameters: RequestParameters = {},
) {
  const filters = requestFilterValues(parameters, timezone);
  const scope = and(
    eq(conversations.professionalId, professionalId),
    isNull(conversations.deletedAt),
    isNull(conversations.anonymizedAt),
    eq(patientAccounts.deletionState, "active"),
    filters.state === "all"
      ? undefined
      : eq(patientSessionRequests.status, filters.state),
    filters.fromUtc
      ? gte(patientSessionRequests.createdAt, filters.fromUtc)
      : undefined,
    filters.untilUtc
      ? lt(patientSessionRequests.createdAt, filters.untilUtc)
      : undefined,
  );
  const joins = () =>
    db
      .select({ value: count() })
      .from(patientSessionRequests)
      .innerJoin(
        conversations,
        eq(conversations.id, patientSessionRequests.conversationId),
      )
      .innerJoin(
        patientAccounts,
        eq(patientAccounts.userId, patientSessionRequests.userId),
      )
      .innerJoin(
        patientConversationLinks,
        and(
          eq(patientConversationLinks.conversationId, conversations.id),
          eq(patientConversationLinks.userId, patientSessionRequests.userId),
        ),
      );
  const [totalRow] = await joins().where(scope);
  const total = Number(totalRow?.value || 0);
  const pages = Math.max(1, Math.ceil(total / REQUEST_PAGE_SIZE));
  const page = Math.min(pageNumber(parameters.solicitudes), pages);
  const order = filters.state === "pending" ? asc : desc;
  const rows = await db
    .select({
      id: patientSessionRequests.id,
      kind: patientSessionRequests.kind,
      status: patientSessionRequests.status,
      reason: patientSessionRequests.reason,
      createdAt: patientSessionRequests.createdAt,
      updatedAt: patientSessionRequests.updatedAt,
      preferredStartsAt: patientSessionRequests.preferredStartsAt,
      timezone: patientSessionRequests.timezone,
      conversationId: patientSessionRequests.conversationId,
      displayName: patientAccounts.displayName,
      patientId: practicePatients.id,
      linkedStartsAt: practiceAppointments.startsAt,
      linkedTimeZone: practiceAppointments.timeZone,
      linkedStatus: practiceAppointments.status,
      linkedUpdatedAt: practiceAppointments.updatedAt,
    })
    .from(patientSessionRequests)
    .innerJoin(
      conversations,
      eq(conversations.id, patientSessionRequests.conversationId),
    )
    .innerJoin(
      patientAccounts,
      eq(patientAccounts.userId, patientSessionRequests.userId),
    )
    .innerJoin(
      patientConversationLinks,
      and(
        eq(patientConversationLinks.conversationId, conversations.id),
        eq(patientConversationLinks.userId, patientSessionRequests.userId),
      ),
    )
    .leftJoin(
      practicePatients,
      and(
        eq(practicePatients.conversationId, conversations.id),
        eq(practicePatients.professionalId, professionalId),
      ),
    )
    .leftJoin(
      practiceAppointments,
      and(
        eq(practiceAppointments.id, patientSessionRequests.appointmentId),
        eq(practiceAppointments.professionalId, professionalId),
        eq(practiceAppointments.patientId, practicePatients.id),
      ),
    )
    .where(scope)
    .orderBy(
      order(patientSessionRequests.createdAt),
      order(patientSessionRequests.id),
    )
    .limit(REQUEST_PAGE_SIZE)
    .offset((page - 1) * REQUEST_PAGE_SIZE);
  return { rows, total, page, pages, filters };
}

export type RequestContextData = {
  kind: string;
  status: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  preferredStartsAt: string | null;
  timezone: string;
  linkedStartsAt: string | null;
  linkedTimeZone: string | null;
  linkedStatus: string | null;
  linkedUpdatedAt: string | null;
};

export function requestStatusText(
  request: Pick<RequestContextData, "kind" | "status">,
) {
  if (request.status === "confirmed")
    return request.kind === "cancel"
      ? "Cancelación confirmada"
      : request.kind === "reschedule"
        ? "Reprogramación confirmada"
        : "Sesión confirmada";
  return (
    (
      {
        pending: "Pendiente de respuesta",
        reviewed: "Revisada · seguir por chat",
        declined: "Solicitud no aceptada",
        withdrawn: "Solicitud retirada",
      } as Record<string, string>
    )[request.status] || "Estado no disponible"
  );
}

export function requestReasonText(reason: string | null) {
  return (
    (
      {
        schedule: "Cambio de horario",
        unavailable: "No puedo asistir",
        no_longer_needed: "Ya no necesito esta sesión",
        other: "Prefiero acordarlo por chat",
      } as Record<string, string>
    )[reason || ""] || "Sin motivo indicado"
  );
}

export function linkedRequestTimeLabel(request: RequestContextData) {
  // No existe snapshot histórico: una cita modificada no acredita su hora original.
  const unchanged =
    request.linkedUpdatedAt &&
    Date.parse(request.linkedUpdatedAt) < Date.parse(request.createdAt);
  return request.kind !== "new" && request.status !== "confirmed" && unchanged
    ? "Horario original de la sesión"
    : "Sesión vinculada · horario actual";
}

export function requestDateText(iso: string, timezone: string) {
  if (!Number.isFinite(Date.parse(iso))) return "Fecha no disponible";
  const zone = timeZoneSchema.safeParse(timezone).success ? timezone : "UTC";
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: zone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function requestNextStep(
  request: RequestContextData,
  audience: "patient" | "professional",
) {
  const patient = audience === "patient";
  if (request.status === "confirmed")
    return "Esta decisión se guardó en el calendario. Consulta la sesión vinculada para ver su estado actual.";
  if (request.status === "withdrawn")
    return "La solicitud se retiró. Retirarla no modifica una sesión ya guardada; consulta el calendario antes de hacer otra propuesta.";
  if (request.status === "declined")
    return "Esta propuesta no se aceptó. Continúa por chat para acordar el siguiente paso; el calendario no cambia por este resultado.";
  if (request.status === "reviewed")
    return "La revisión no confirma ni cambia la sesión. Continúa por chat para acordar el siguiente paso.";
  if (request.status !== "pending")
    return "Consulta el chat para aclarar el estado de esta solicitud.";
  if (request.kind !== "new" && request.linkedStatus !== "scheduled")
    return "La sesión vinculada ya cambió o no está disponible. Revisa su estado actual y coordina el siguiente paso por chat.";
  if (request.kind === "cancel")
    return patient
      ? "La sesión sigue programada hasta que el profesional confirme la cancelación. Puedes coordinarla por chat o retirar la solicitud."
      : "La sesión sigue programada. Confirma la cancelación para actualizar el calendario o continúa la coordinación por chat.";
  if (request.kind === "reschedule")
    return patient
      ? "El horario guardado sigue vigente hasta que el profesional confirme el cambio. La hora propuesta todavía no está reservada."
      : "El horario guardado sigue vigente. Revisa ambas horas y acuerda el cambio antes de confirmarlo.";
  return patient
    ? "La hora propuesta todavía no está reservada. El profesional revisará disponibilidad y condiciones antes de confirmar."
    : "La hora propuesta todavía no está reservada. Acuerda las condiciones por chat y confirma para crear la sesión.";
}
