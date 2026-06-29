// Señal de tiempo de respuesta mostrada en el feed público.
// Reglas duras: etiquetas cálidas, NUNCA cifras exactas ni contadores de espera,
// y NUNCA inventar tiempos (cold-start usa señal real de disponibilidad).

export type ResponseTone =
  | "available"
  | "fast"
  | "soon"
  | "new"
  | "unavailable";

export type ResponseSignal = {
  label: string;
  tone: ResponseTone;
};

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Fase 5 — datos reales: convierte la mediana de la primera respuesta (ms) y el
 * ratio de conversaciones respondidas en un bucket cálido. La mediana resiste
 * outliers; el ratio degrada la etiqueta si el profesional suele no responder.
 */
export function toResponseBucket(
  medianMs: number,
  answeredRatio: number,
): ResponseSignal {
  if (answeredRatio < 0.5) {
    return { label: "Puede tardar más de un día", tone: "soon" };
  }
  if (medianMs < 10 * MIN) {
    return { label: "Suele responder en minutos", tone: "fast" };
  }
  if (medianMs < HOUR) {
    return { label: "Suele responder en menos de una hora", tone: "fast" };
  }
  if (medianMs < 6 * HOUR) {
    return { label: "Suele responder en pocas horas", tone: "soon" };
  }
  if (medianMs < 24 * HOUR) {
    return { label: "Suele responder hoy", tone: "soon" };
  }
  return { label: "Puede tardar más de un día", tone: "soon" };
}

type SignalInput = {
  acceptingRequests: boolean;
  currentActiveRequests: number;
  maxActiveRequests: number;
  // Caché de respuesta real (Fase 5). Opcional: en Fase 1 no existe todavía.
  responseMedianMs?: number | null;
  responseAnsweredRatio?: number | null;
  responseSampleSize?: number | null;
};

/**
 * Señal que muestra cada tarjeta del feed. Si hay suficientes muestras reales
 * (Fase 5) usa el bucket calculado; si no, cold-start honesto desde la
 * disponibilidad y el cupo actuales (sin fabricar tiempos).
 */
export function professionalResponseSignal(pro: SignalInput): ResponseSignal {
  const hasRealData =
    pro.responseSampleSize != null &&
    pro.responseSampleSize >= 3 &&
    pro.responseMedianMs != null &&
    pro.responseAnsweredRatio != null;

  if (hasRealData) {
    return toResponseBucket(
      pro.responseMedianMs as number,
      pro.responseAnsweredRatio as number,
    );
  }

  if (!pro.acceptingRequests) {
    return { label: "No disponible por ahora", tone: "unavailable" };
  }
  if (pro.currentActiveRequests >= pro.maxActiveRequests) {
    return { label: "Con cupo completo ahora", tone: "unavailable" };
  }
  return { label: "Disponible para acompañar", tone: "available" };
}

export function isAvailableNow(pro: {
  acceptingRequests: boolean;
  currentActiveRequests: number;
  maxActiveRequests: number;
}): boolean {
  return (
    pro.acceptingRequests && pro.currentActiveRequests < pro.maxActiveRequests
  );
}
