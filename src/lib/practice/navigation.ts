import { patientStates } from "./patient-states";

function boundedPage(page: number) {
  return Number.isFinite(page)
    ? Math.min(10000, Math.max(1, Math.floor(page)))
    : 1;
}

function queryPage(value: string | null) {
  return value && /^\d{1,5}$/.test(value) ? boundedPage(Number(value)) : 1;
}

export function patientListHref(
  query: { q?: string; estado?: string },
  page = 1,
) {
  const params = new URLSearchParams();
  const term = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
  const state = patientStates.find((value) => value === query.estado);
  if (term) params.set("q", term);
  if (state) params.set("estado", state);
  const currentPage = boundedPage(page);
  if (currentPage > 1) params.set("pagina", String(currentPage));
  const search = params.toString();
  return `/pro/pacientes${search ? `?${search}` : ""}`;
}

export function messageListHref(page = 1) {
  const currentPage = boundedPage(page);
  return `/pro/mensajes${currentPage > 1 ? `?pagina=${currentPage}` : ""}`;
}

/** Los favoritos anteriores apuntaban a secciones de la agenda. El fragmento
 * solo llega al navegador; trasladar únicamente los filtros de esa vista. */
export function legacyPracticeHref(
  pathname: string,
  search: string,
  hash: string,
) {
  if (pathname !== "/pro/consulta") return null;
  const params = new URLSearchParams(search);
  if (hash === "#pacientes")
    return patientListHref(
      { q: params.get("q") || "", estado: params.get("estado") || "" },
      queryPage(params.get("pagina")),
    );
  if (hash === "#chats") return messageListHref(queryPage(params.get("chats")));
  return null;
}
