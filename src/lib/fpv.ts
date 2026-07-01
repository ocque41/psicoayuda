import "server-only";

// Verificación contra la Federación de Psicólogos de Venezuela.
// La consulta pública de sistema.fpv.org.ve usa esta API JSON (descubierta en su
// bundle). Filtra exacto por `cedula` y por `fpv`. Ejemplos confirmados:
//   GET /psicologos_public?cedula=27448493  -> el registro de esa cédula
//   GET /psicologos_public?fpv=19257        -> el registro de ese Nº FPV
// La usamos server-side desde el Worker (sin CORS, sin scraping de pantalla).
const FPV_ENDPOINT = "https://api.sistema.fpv.org.ve/api/v1/psicologos_public";
const TIMEOUT_MS = 6000;

// Subconjunto del registro oficial que SÍ guardamos (nunca la cédula, ni PII de
// más): sirve para el badge del admin y para re-verificar en la Fase 2.
export type FpvOfficial = {
  fpv: string | null;
  nombreCompleto: string;
  universidad: string | null;
  denominacionTitulo: string | null;
  colegios: { colegio: string; solvencia: boolean }[];
  solvenciaColegio: boolean | null;
  statusGeneral: boolean | null;
  deletedAt: string | null;
};

export type FpvVerification = {
  found: boolean;
  // Coincidencia fuerte: existe el registro Y el Nº FPV Y el nombre cuadran.
  match: boolean;
  fpvMatch: boolean;
  nameMatch: boolean;
  // Señal blanda (la universidad es texto libre): null si no se pudo comparar.
  universityMatch: boolean | null;
  official: FpvOfficial | null;
  checkedAt: string;
  // Solo presente si la consulta falló (timeout/red/API caída): degradamos sin
  // romper el alta y lo dejamos sin verificar.
  error?: string;
};

type FpvItem = Record<string, unknown>;

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalize(value: string): string {
  return str(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function digits(value: string): string {
  return str(value).replace(/\D/g, "");
}

function nameTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 2),
  );
}

function toOfficial(item: FpvItem): FpvOfficial {
  const rawColegios = Array.isArray(item.colegios) ? item.colegios : [];
  const colegios = rawColegios.map((entry) => {
    const c = (entry ?? {}) as Record<string, unknown>;
    return { colegio: str(c.colegio), solvencia: Boolean(c.solvencia) };
  });
  return {
    fpv: item.fpv != null ? str(item.fpv) : null,
    nombreCompleto: str(item.nombreCompleto).replace(/\s+/g, " ").trim(),
    universidad: item.universidad ? str(item.universidad) : null,
    denominacionTitulo: item.denominacionTitulo
      ? str(item.denominacionTitulo)
      : null,
    colegios,
    solvenciaColegio:
      typeof item.solvenciaColegio === "boolean" ? item.solvenciaColegio : null,
    statusGeneral:
      typeof item.statusGeneral === "boolean" ? item.statusGeneral : null,
    deletedAt: item.deletedAt ? str(item.deletedAt) : null,
  };
}

export type CrossCheckInput = {
  fpvNumber?: string | null;
  fullName: string;
  university?: string | null;
};

// Cruce puro (sin red) — separado para poder testearlo con registros fijos.
export function crossCheck(
  item: FpvItem,
  input: CrossCheckInput,
): Omit<FpvVerification, "checkedAt"> {
  const official = toOfficial(item);

  const fpvMatch =
    Boolean(input.fpvNumber) &&
    official.fpv != null &&
    digits(str(input.fpvNumber)) !== "" &&
    digits(str(input.fpvNumber)) === digits(official.fpv);

  // Nombre: exigimos que el primer nombre Y el primer apellido oficiales
  // aparezcan en el nombre que declaró el profesional (tolerante a segundos
  // nombres/apellidos omitidos y a orden distinto).
  const entered = nameTokens(input.fullName);
  const primerNombre = normalize(str(item.primerNombre));
  const primerApellido = normalize(str(item.primerApellido));
  const core = [primerNombre, primerApellido].filter(
    (token) => token.length >= 2,
  );
  const nameMatch = core.length === 2 && core.every((t) => entered.has(t));

  let universityMatch: boolean | null = null;
  if (input.university && official.universidad) {
    const u = normalize(input.university);
    const o = normalize(official.universidad);
    universityMatch = u === o || u.includes(o) || o.includes(u);
  }

  return {
    found: true,
    match: fpvMatch && nameMatch,
    fpvMatch,
    nameMatch,
    universityMatch,
    official,
  };
}

async function fetchItems(query: string): Promise<FpvItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${FPV_ENDPOINT}?${query}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const body = (await response.json()) as {
      data?: { items?: unknown };
    };
    const items = body?.data?.items;
    return Array.isArray(items) ? (items as FpvItem[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

function notFound(checkedAt: string, error?: string): FpvVerification {
  return {
    found: false,
    match: false,
    fpvMatch: false,
    nameMatch: false,
    universityMatch: null,
    official: null,
    checkedAt,
    ...(error ? { error } : {}),
  };
}

// Alta: se consulta por cédula (que NO se persiste) y se cruza con lo declarado.
export async function verifyFpvByCedula(
  input: CrossCheckInput & { cedula: string },
): Promise<FpvVerification> {
  const checkedAt = new Date().toISOString();
  const cedula = digits(input.cedula);
  if (!cedula) return notFound(checkedAt);
  try {
    const items = await fetchItems(
      `cedula=${encodeURIComponent(cedula)}&page=1&perPage=5`,
    );
    const item = items.find((i) => digits(str(i.cedula)) === cedula);
    if (!item) return notFound(checkedAt);
    return { ...crossCheck(item, input), checkedAt };
  } catch (error) {
    return notFound(
      checkedAt,
      error instanceof Error ? error.message : "fpv_fetch_failed",
    );
  }
}

// Fase 2 (re-verificación): sin cédula, se consulta por Nº FPV — que sí
// guardamos — para refrescar solvencia/estatus o detectar bajas (deletedAt).
export async function fetchFpvByNumber(
  fpvNumber: string,
): Promise<FpvOfficial | null> {
  const fpv = digits(fpvNumber);
  if (!fpv) return null;
  const items = await fetchItems(
    `fpv=${encodeURIComponent(fpv)}&page=1&perPage=5`,
  );
  const item = items.find((i) => digits(str(i.fpv)) === fpv);
  return item ? toOfficial(item) : null;
}
