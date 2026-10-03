export type CycleUsage = {
  consumed: number;
  completed: number;
  reserved: number;
  noShows: number;
  cancelled: number;
};

export type CycleCreditState =
  | "active"
  | "upcoming"
  | "expired"
  | "exhausted"
  | "overcommitted"
  | "needs_review";

const count = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

/** Proyección informativa; la reserva sigue decidiéndose en los triggers.
 * `consumed` cuenta TODAS las citas no canceladas, una sola vez. Una ausencia
 * no es una sesión realizada ni una reserva: ocupa crédito y se explica aparte.
 */
export function cycleCredits(
  cycle: {
    sessionsCount: number;
    status: string;
    startsAt: string;
    endsAt: string;
  },
  usage: CycleUsage,
  at: string,
) {
  const included = count(cycle.sessionsCount);
  const consumed = count(usage.consumed);
  const completed = count(usage.completed);
  const reserved = count(usage.reserved);
  const noShows = count(usage.noShows);
  const cancelled = count(usage.cancelled);
  const otherConsumed = Math.max(0, consumed - completed - reserved - noShows);
  const remaining = Math.max(0, included - consumed);
  const start = Date.parse(cycle.startsAt);
  const end = Date.parse(cycle.endsAt);
  const now = Date.parse(at);
  const validUsage = [
    usage.consumed,
    usage.completed,
    usage.reserved,
    usage.noShows,
    usage.cancelled,
  ].every((value) => Number.isSafeInteger(value) && value >= 0);
  let state: CycleCreditState;
  if (
    cycle.status !== "paid" ||
    !Number.isSafeInteger(cycle.sessionsCount) ||
    cycle.sessionsCount < 0 ||
    !validUsage ||
    completed + reserved + noShows > consumed ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(now) ||
    end <= start
  ) {
    state = "needs_review";
  } else if (consumed > included) {
    state = "overcommitted";
  } else if (now >= end) {
    state = "expired";
  } else if (remaining === 0) {
    state = "exhausted";
  } else if (now < start) {
    state = "upcoming";
  } else {
    state = "active";
  }
  return {
    included,
    completed,
    reserved,
    consumed,
    noShows,
    cancelled,
    otherConsumed,
    remaining,
    available: state === "active" || state === "upcoming" ? remaining : 0,
    state,
  };
}

export const cycleCreditLabels: Record<CycleCreditState, string> = {
  active: "Vigente",
  upcoming: "Próximo ciclo",
  expired: "Vigencia finalizada",
  exhausted: "Sin sesiones disponibles",
  overcommitted: "Saldo por revisar",
  needs_review: "En revisión",
};

/** Incluye el año: los ciclos de meses iguales pueden ser de años distintos. */
export function cycleDateLabel(iso: string, timeZone: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Fecha por revisar";
  return new Intl.DateTimeFormat("es-VE", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export const cycleCreditDescriptions: Record<CycleCreditState, string> = {
  active:
    "Acuerda con tu profesional las fechas dentro de este periodo. Este saldo no confirma una reserva.",
  upcoming:
    "Las sesiones disponibles corresponden a las fechas de este próximo periodo. Tu profesional confirma el horario.",
  expired:
    "El periodo terminó. Las sesiones restantes no están disponibles para nuevas reservas; acuerda la continuidad con tu profesional.",
  exhausted:
    "Todas las sesiones incluidas están contabilizadas. Revisa las realizadas, reservas y ausencias con tu profesional.",
  overcommitted:
    "Hay más sesiones contabilizadas que incluidas. Pide a tu profesional que revise el registro antes de acordar otra reserva.",
  needs_review:
    "El ciclo necesita revisión y sus sesiones no se muestran disponibles. Consulta a tu profesional antes de acordar otra reserva.",
};
