import "server-only";

import { and, eq, or } from "drizzle-orm";
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
  // Correo de la cuenta. Se muestra como link `mailto:` SOLO si `emailPublic`.
  // No es el `contactEmail` de coordinación (ese es interno).
  email: string;
  // ¿Publicar el correo como contacto en la ficha? Una de las 3 vías.
  emailPublic: boolean;
  crisisExperience: boolean;
  // Etiqueta pública: acompaña sin credencial clínica (estudiante/voluntario).
  nonClinicalHelper: boolean;
  // También atiende presencial (en su ciudad, Venezuela), además de/en vez de remoto.
  inPersonAvailable: boolean;
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
    emailPublic: boolean;
    crisisExperience: boolean;
    nonClinicalHelper: boolean;
    inPersonAvailable: boolean;
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
        emailPublic: professionals.emailPublic,
        crisisExperience: professionals.crisisExperience,
        nonClinicalHelper: professionals.nonClinicalHelper,
        inPersonAvailable: professionals.inPersonAvailable,
        acceptingRequests: professionals.acceptingRequests,
        currentActiveRequests: professionals.currentActiveRequests,
        maxActiveRequests: professionals.maxActiveRequests,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.status, "approved"),
          // Visible si atiende remoto O presencial (antes solo remoto, lo que
          // ocultaba a quien solo ofrece presencial).
          or(
            eq(professionals.remoteAvailable, true),
            eq(professionals.inPersonAvailable, true),
          ),
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
    emailPublic: r.emailPublic,
    crisisExperience: r.crisisExperience,
    nonClinicalHelper: r.nonClinicalHelper,
    inPersonAvailable: r.inPersonAvailable,
    acceptingRequests: r.acceptingRequests,
    currentActiveRequests: r.currentActiveRequests,
    maxActiveRequests: r.maxActiveRequests,
  }));

  // Disponibles primero (pueden responder ya); DENTRO de cada grupo, orden
  // ALEATORIO. Con ISR (revalidación ~60s) el orden rota, así no salen siempre
  // los mismos arriba y todos tienen la misma oportunidad de aparecer primero.
  const shuffle = <T>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const disponibles = shuffle(mapped.filter((p) => isAvailableNow(p)));
  const resto = shuffle(mapped.filter((p) => !isAvailableNow(p)));
  return [...disponibles, ...resto];
}
