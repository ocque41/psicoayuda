import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { isAvailableNow } from "@/lib/response-bucket";

export type FeedProfessional = {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  languages: string[];
  supportAreas: string[];
  shortBio: string | null;
  crisisExperience: boolean;
  acceptingRequests: boolean;
  currentActiveRequests: number;
  maxActiveRequests: number;
};

function parseJsonList(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * Feed público: SOLO profesionales verificados (status='approved') y remotos.
 * Devuelve únicamente columnas públicas — nunca email, licencia, contactEmail
 * ni userId. Orden: disponibles (aceptando + con cupo) primero.
 */
export async function getFeedProfessionals(): Promise<FeedProfessional[]> {
  // Resiliente: si la DB no está disponible (p. ej. prerender en build sin el
  // binding D1), devolvemos lista vacía en vez de romper. En runtime se llena.
  let rows: Array<{
    id: string;
    fullName: string;
    displayName: string | null;
    city: string | null;
    country: string | null;
    languages: string;
    supportAreas: string;
    shortBio: string | null;
    crisisExperience: boolean;
    acceptingRequests: boolean;
    currentActiveRequests: number;
    maxActiveRequests: number;
  }> = [];
  try {
    rows = await db
      .select({
        id: professionals.id,
        fullName: professionals.fullName,
        displayName: professionals.displayName,
        city: professionals.city,
        country: professionals.country,
        languages: professionals.languages,
        supportAreas: professionals.supportAreas,
        shortBio: professionals.shortBio,
        crisisExperience: professionals.crisisExperience,
        acceptingRequests: professionals.acceptingRequests,
        currentActiveRequests: professionals.currentActiveRequests,
        maxActiveRequests: professionals.maxActiveRequests,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.status, "approved"),
          eq(professionals.remoteAvailable, true),
        ),
      );
  } catch {
    return [];
  }

  const mapped: FeedProfessional[] = rows.map((r) => ({
    id: r.id,
    // Nombre público si lo dieron; si no, solo el nombre de pila (privacidad).
    name: r.displayName || r.fullName.split(" ")[0] || "Voluntario/a",
    city: r.city,
    country: r.country,
    languages: parseJsonList(r.languages),
    supportAreas: parseJsonList(r.supportAreas),
    shortBio: r.shortBio,
    crisisExperience: r.crisisExperience,
    acceptingRequests: r.acceptingRequests,
    currentActiveRequests: r.currentActiveRequests,
    maxActiveRequests: r.maxActiveRequests,
  }));

  return mapped.sort(
    (a, b) => Number(isAvailableNow(b)) - Number(isAvailableNow(a)),
  );
}
