import type {
  AdmissionBoardData,
  AdmissionGate,
  AdmissionStage,
} from "@/lib/admission/types";

export type AdmissionBoardViewData = AdmissionBoardData & {
  viewMode?: "paola";
};

export const admissionGateLabels: Record<AdmissionGate, string> = {
  identity: "Identidad",
  credentials: "Credenciales",
  scope: "Ámbito vigente",
  interview: "Entrevista",
};

export function admissionRegistrationLabel(value: string | null) {
  switch (value) {
    case "colegio_psicologos":
      return "Colegio u organismo profesional de su jurisdicción";
    case "ministerio_educacion":
      return "Ministerio de Educación";
    case "inprepsi":
      return "INPREPSI";
    default:
      return "Tipo de registro por confirmar";
  }
}

export function admissionHref(
  data: Pick<AdmissionBoardData, "query" | "stageFilter" | "page"> & {
    viewMode?: "paola";
  },
  options: { candidate?: string; page?: number; historyPage?: number } = {},
) {
  const params = new URLSearchParams();
  if (data.viewMode === "paola") params.set("vista", "paola");
  if (data.query) params.set("q", data.query);
  if (data.stageFilter) params.set("etapa", data.stageFilter);
  const page = options.page ?? data.page;
  if (page > 1) params.set("pagina", String(page));
  if (options.candidate) params.set("candidato", options.candidate);
  if (options.historyPage && options.historyPage > 1)
    params.set("historial", String(options.historyPage));
  return `/admin/admision${params.size ? `?${params.toString()}` : ""}`;
}

/** Sólo cambia la presentación. La identidad y los permisos vienen del servidor. */
export function admissionViewHref(
  data: Pick<AdmissionBoardData, "query" | "stageFilter" | "page">,
  paolaView: boolean,
) {
  return admissionHref({ ...data, viewMode: paolaView ? "paola" : undefined });
}

export function completedGates(gates: Record<AdmissionGate, boolean>) {
  return Object.values(gates).filter(Boolean).length;
}

/** No permite mover ni quitar la publicación final ni borrar etapas esenciales. */
export function moveAdmissionStage(
  stages: AdmissionStage[],
  index: number,
  delta: -1 | 1,
) {
  const target = index + delta;
  if (
    index < 0 ||
    target < 0 ||
    target >= stages.length ||
    stages[index]?.id === "publication" ||
    stages[target]?.id === "publication"
  )
    return stages;
  const next = stages.map((stage) => ({ ...stage }));
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function formatAdmissionDate(value: string, timeZone = "UTC") {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Fecha sin confirmar";
  try {
    return new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return "Fecha sin confirmar";
  }
}
