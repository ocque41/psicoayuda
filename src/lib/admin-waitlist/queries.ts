import "server-only";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  assignments,
  helpRequests,
  professionals,
  user,
  waitlistEntries,
} from "@/db/schema";
import {
  languageLabels,
  needSeekerLabels,
  urgencyLabels,
} from "@/lib/constants";
import { currentWaitlistAdmin, isWaitlistAdminLive } from "./access";
import {
  type AdminWaitlistData,
  type AdminWaitlistQuery,
  type GeneralWaitlistDetail,
  type GeneralWaitlistStatus,
  generalWaitlistStatuses,
  generalWaitlistStatusLabels,
  type HelpWaitlistDetail,
  helpQueueFilters,
  type WaitlistAdmin,
  type WaitlistDetail,
  type WaitlistListItem,
} from "./types";

const PAGE_SIZE = 25;
const sourceLabels: Record<string, string> = {
  profesionales: "Directorio de profesionales",
  ayuda: "Página de pedir ayuda",
  "lista-de-espera": "Página de la lista de espera",
  chat: "Chat con un profesional",
};
const helpStatusLabels: Record<string, string> = {
  new: "Nueva solicitud",
  offered: "Esperando aceptación",
  contacted: "Contactada",
  assigned: "Con profesional",
  closed: "Cerrada",
};
const assignmentLabels: Record<string, string> = {
  suggested: "Preferencia de la persona",
  offered: "Invitación pendiente",
  accepted: "Aceptada",
  assigned: "Asignada",
  missed: "Invitación finalizada",
  closed: "Cerrada",
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
function literalLike(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}
const activeCount = sql<number>`(SELECT count(*) FROM assignments a WHERE a.help_request_id=help_requests.id AND a.status IN ('accepted','assigned'))`;
const offeredCount = sql<number>`(SELECT count(*) FROM assignments a WHERE a.help_request_id=help_requests.id AND a.status='offered')`;
// Una invitación no ocupa plaza. El filtro de revisión incluye los mismos
// desfases que el aviso requiresReview: estado assigned sin relación activa,
// relación activa con otro estado o estado anterior. Consultar no los corrige.
const helpGroup = sql<string>`CASE WHEN help_requests.status='closed' THEN 'closed'
  WHEN help_requests.status='assigned' AND ${activeCount}>0 THEN 'assigned'
  WHEN help_requests.status IN ('new','offered','contacted') AND ${activeCount}=0 THEN 'waiting'
  ELSE 'review' END`;
const helpListFields = {
  id: helpRequests.id,
  name: helpRequests.seekerName,
  status: helpRequests.status,
  createdAt: helpRequests.createdAt,
  updatedAt: helpRequests.updatedAt,
  activeAssignments: activeCount,
  offeredAssignments: offeredCount,
};

function generalItem(row: {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}): WaitlistListItem {
  return {
    ...row,
    tab: "general",
    name: null,
    statusLabel:
      generalWaitlistStatusLabels[row.status as GeneralWaitlistStatus] ||
      "Estado anterior por revisar",
    activeAssignments: 0,
    offeredAssignments: 0,
    requiresReview: !generalWaitlistStatuses.includes(
      row.status as GeneralWaitlistStatus,
    ),
  };
}
function helpItem(
  row:
    | typeof helpRequests.$inferSelect
    | {
        id: string;
        name: string | null;
        status: string;
        createdAt: string;
        updatedAt: string;
        activeAssignments: number;
        offeredAssignments: number;
      },
): WaitlistListItem {
  const active = "activeAssignments" in row ? Number(row.activeAssignments) : 0;
  return {
    id: row.id,
    tab: "terremoto",
    name: "name" in row ? row.name : row.seekerName,
    status: row.status,
    statusLabel: helpStatusLabels[row.status] || "Estado anterior por revisar",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    activeAssignments: active,
    offeredAssignments:
      "offeredAssignments" in row ? Number(row.offeredAssignments) : 0,
    requiresReview:
      row.status !== "closed" &&
      ((row.status === "assigned" && !active) ||
        (row.status !== "assigned" && active > 0) ||
        !["new", "offered", "contacted", "assigned"].includes(row.status)),
  };
}

async function readDetail(
  actor: WaitlistAdmin,
  tab: "general" | "terremoto",
  id: string,
): Promise<WaitlistDetail | null> {
  if (!id || id.length > 160) return null;
  if (tab === "general") {
    const [row] = await db
      .select({
        id: waitlistEntries.id,
        status: waitlistEntries.status,
        createdAt: waitlistEntries.createdAt,
        updatedAt: waitlistEntries.updatedAt,
        email: waitlistEntries.email,
        title: waitlistEntries.title,
        description: waitlistEntries.description,
        source: waitlistEntries.source,
      })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.id, id),
          isNull(waitlistEntries.anonymizedAt),
          currentWaitlistAdmin(actor),
        ),
      )
      .limit(1);
    return row
      ? ({
          ...generalItem(row),
          ...row,
          tab: "general",
          sourceLabel: sourceLabels[row.source] || "Formulario",
        } satisfies GeneralWaitlistDetail)
      : null;
  }
  const [row] = await db
    .select({
      ...helpListFields,
      email: helpRequests.email,
      country: helpRequests.country,
      state: helpRequests.state,
      city: helpRequests.city,
      language: helpRequests.language,
      needCategory: helpRequests.needCategory,
      urgency: helpRequests.urgency,
      consentContact: helpRequests.consentContact,
    })
    .from(helpRequests)
    .where(
      and(
        eq(helpRequests.id, id),
        isNull(helpRequests.anonymizedAt),
        currentWaitlistAdmin(actor),
      ),
    )
    .limit(1);
  if (!row) return null;
  const relations = await db
    .select({
      id: assignments.id,
      professionalId: assignments.professionalId,
      professionalName: professionals.displayName,
      fullName: professionals.fullName,
      status: assignments.status,
    })
    .from(assignments)
    .innerJoin(professionals, eq(professionals.id, assignments.professionalId))
    .where(
      and(
        eq(assignments.helpRequestId, id),
        currentWaitlistAdmin(actor),
        sql`EXISTS(SELECT 1 FROM help_requests WHERE id=${id} AND anonymized_at IS NULL)`,
      ),
    )
    .orderBy(
      sql`CASE WHEN ${assignments.status} IN ('accepted','assigned') THEN 0 WHEN ${assignments.status}='offered' THEN 1 ELSE 2 END`,
      desc(assignments.createdAt),
      asc(assignments.id),
    )
    .limit(51);
  return {
    ...helpItem(row),
    ...row,
    tab: "terremoto",
    languageLabel:
      languageLabels[row.language as keyof typeof languageLabels] ||
      "Otro idioma indicado",
    needCategoryLabel:
      needSeekerLabels[row.needCategory as keyof typeof needSeekerLabels] ||
      "Otra necesidad indicada",
    urgencyLabel:
      urgencyLabels[row.urgency as keyof typeof urgencyLabels] ||
      "Sin indicación",
    assignments: relations.slice(0, 50).map(({ fullName, ...item }) => ({
      ...item,
      professionalName: item.professionalName || fullName,
      statusLabel: assignmentLabels[item.status] || "Estado anterior",
    })),
    assignmentsHasMore: relations.length > 50,
  } satisfies HelpWaitlistDetail;
}

export async function readAdminWaitlistData(
  actor: WaitlistAdmin,
  query: AdminWaitlistQuery,
): Promise<AdminWaitlistData> {
  const tab = first(query.fuente) === "terremoto" ? "terremoto" : "general";
  const rawStatus = first(query.estado);
  const values: readonly string[] =
    tab === "general" ? generalWaitlistStatuses : helpQueueFilters;
  const status =
    rawStatus === "all" || values.includes(rawStatus)
      ? rawStatus
      : tab === "general"
        ? "all"
        : "waiting";
  const rawQuery = first(query.q).trim().slice(0, 120);
  const queryWarning = rawQuery.includes("@")
    ? "La búsqueda por correo se ha descartado. Usa la referencia de la solicitud o el alias indicado."
    : null;
  const q = queryWarning ? "" : rawQuery;
  const requestedPage = /^\d{1,7}$/.test(first(query.pagina))
    ? Math.max(1, Number(first(query.pagina)))
    : 1;
  const empty: AdminWaitlistData = {
    items: [],
    page: 1,
    pages: 1,
    total: 0,
    counts: {},
    sourceCounts: { general: 0, terremoto: 0 },
    tab,
    q,
    queryWarning,
    status,
    selected: null,
    failed: true,
  };
  try {
    if (!(await isWaitlistAdminLive(actor))) return empty;
    const guard = currentWaitlistAdmin(actor);
    const pattern = literalLike(q);
    const generalScope = and(
      isNull(waitlistEntries.anonymizedAt),
      guard,
      q
        ? or(sql`${waitlistEntries.id} LIKE ${pattern} ESCAPE ${"\\"}`)
        : undefined,
    );
    const helpScope = and(
      isNull(helpRequests.anonymizedAt),
      guard,
      q
        ? or(
            sql`${helpRequests.id} LIKE ${pattern} ESCAPE ${"\\"}`,
            sql`${helpRequests.seekerName} LIKE ${pattern} ESCAPE ${"\\"}`,
          )
        : undefined,
    );
    const [generalCounts, helpCounts, sources] = await db.batch([
      db
        .select({ key: waitlistEntries.status, count: sql<number>`count(*)` })
        .from(waitlistEntries)
        .where(generalScope)
        .groupBy(waitlistEntries.status),
      db
        .select({
          key: helpGroup.as("queue_group"),
          count: sql<number>`count(*)`,
        })
        .from(helpRequests)
        .where(helpScope)
        .groupBy(helpGroup),
      db
        .select({
          general: sql<number>`(SELECT count(*) FROM waitlist_entries WHERE anonymized_at IS NULL)`,
          terremoto: sql<number>`(SELECT count(*) FROM help_requests WHERE anonymized_at IS NULL)`,
        })
        .from(user)
        .where(and(eq(user.id, actor.userId), guard))
        .limit(1),
    ]);
    const counts: Record<string, number> = { all: 0 };
    for (const value of values) counts[value] = 0;
    for (const row of tab === "general" ? generalCounts : helpCounts) {
      counts[row.key] = Number(row.count);
      counts.all += Number(row.count);
    }
    const total = counts[status] || 0;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const items =
      tab === "general"
        ? (
            await db
              .select({
                id: waitlistEntries.id,
                status: waitlistEntries.status,
                createdAt: waitlistEntries.createdAt,
                updatedAt: waitlistEntries.updatedAt,
              })
              .from(waitlistEntries)
              .where(
                and(
                  generalScope,
                  status === "all"
                    ? undefined
                    : eq(waitlistEntries.status, status),
                ),
              )
              .orderBy(
                desc(waitlistEntries.createdAt),
                desc(waitlistEntries.id),
              )
              .limit(PAGE_SIZE)
              .offset((page - 1) * PAGE_SIZE)
          ).map(generalItem)
        : (
            await db
              .select(helpListFields)
              .from(helpRequests)
              .where(
                and(
                  helpScope,
                  status === "all" ? undefined : sql`${helpGroup}=${status}`,
                ),
              )
              .orderBy(desc(helpRequests.createdAt), desc(helpRequests.id))
              .limit(PAGE_SIZE)
              .offset((page - 1) * PAGE_SIZE)
          ).map(helpItem);
    const selected = await readDetail(actor, tab, first(query.persona));
    // The session may have been revoked between the bounded reads.
    if (!(await isWaitlistAdminLive(actor))) return empty;
    return {
      items,
      page,
      pages,
      total,
      counts,
      sourceCounts: {
        general: Number(sources[0]?.general || 0),
        terremoto: Number(sources[0]?.terremoto || 0),
      },
      tab,
      q,
      queryWarning,
      status,
      selected,
      failed: false,
    };
  } catch {
    // No partial disclosure and no clinical content in logs on failure.
    return empty;
  }
}
