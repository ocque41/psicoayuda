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
  photo: string | null;
  // Público por diseño: la ficha funciona como directorio (libro amarillo). Se
  // muestra como botón de WhatsApp/llamada. Null si el profesional no lo dio.
  phone: string | null;
  // Teléfono fijo opcional (solo llamada): se muestra como enlace `tel:`.
  landline: string | null;
  // Público por diseño (libro amarillo): se muestra como link `mailto:` junto al
  // teléfono. Es el correo de la cuenta, no el `contactEmail` de coordinación
  // (ese sigue siendo interno: "no se comparte con las personas").
  email: string;
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
 * Devuelve únicamente columnas públicas — el email de la cuenta sí es público
 * (libro amarillo), pero nunca licencia, contactEmail ni userId. Orden:
 * disponibles (aceptando + con cupo) primero.
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
    photo: string | null;
    phone: string | null;
    landline: string | null;
    email: string;
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
        photo: professionals.photo,
        phone: professionals.phone,
        landline: professionals.landline,
        email: professionals.email,
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
  } catch (error) {
    // En build/prerender (sin binding D1) la lista vacía es lo correcto. Pero un
    // fallo en runtime no debe enmascararse como "no hay profesionales": al
    // menos lo dejamos en los logs/observabilidad para poder verlo.
    console.error("getFeedProfessionals failed", error);
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
    photo: r.photo,
    phone: r.phone,
    landline: r.landline,
    email: r.email,
    crisisExperience: r.crisisExperience,
    acceptingRequests: r.acceptingRequests,
    currentActiveRequests: r.currentActiveRequests,
    maxActiveRequests: r.maxActiveRequests,
  }));

  // Disponibles primero; dentro de cada grupo, desempate determinista por cupo
  // restante (más libre antes) y luego por id, para no fijar el orden al orden
  // físico de filas (que congelaba siempre a los primeros aprobados).
  return mapped.sort((a, b) => {
    const availability = Number(isAvailableNow(b)) - Number(isAvailableNow(a));
    if (availability !== 0) return availability;
    const remainingA = a.maxActiveRequests - a.currentActiveRequests;
    const remainingB = b.maxActiveRequests - b.currentActiveRequests;
    if (remainingA !== remainingB) return remainingB - remainingA;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
