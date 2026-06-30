import "server-only";

// Integración de FUENTE EN VIVO: sismos recientes del USGS (feed GeoJSON
// público, gratuito, sin clave). No inventamos cifras: los datos vienen tal
// cual del USGS. Se hace SERVER-SIDE (la CSP del navegador bloquea fetch a
// dominios externos) y se cachea/revalida en el edge cada 5 minutos, igual que
// los visores ciudadanos de la emergencia.

export type Quake = {
  id: string;
  mag: number | null;
  place: string;
  time: number; // epoch ms
  url: string;
  lat: number;
  lon: number;
  depthKm: number | null;
};

// Caja envolvente de Venezuela + costa/Caribe cercano (donde está la secuencia
// sísmica reciente: Caraballeda, Morón, La Guaira…).
const VE = { latMin: 0.5, latMax: 13.2, lonMin: -74, lonMax: -59 };

const FEED =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";

export const USGS_SOURCE = {
  name: "U.S. Geological Survey (USGS)",
  url: "https://earthquake.usgs.gov/earthquakes/map/",
};

type UsgsFeature = {
  id?: string;
  properties?: { mag?: number; place?: string; time?: number; url?: string };
  geometry?: { coordinates?: [number, number, number] };
};

/**
 * Devuelve los sismos recientes (última semana, M≥2.5) dentro de Venezuela y su
 * entorno, más recientes primero. Resiliente: si el feed falla, devuelve [].
 */
export async function getVenezuelaQuakes(limit = 10): Promise<Quake[]> {
  try {
    const res = await fetch(FEED, {
      next: { revalidate: 300 },
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: UsgsFeature[] };

    const quakes: Quake[] = [];
    for (const f of data.features ?? []) {
      const coords = f.geometry?.coordinates;
      if (!coords) continue;
      const [lon, lat, depth] = coords;
      if (
        lat < VE.latMin ||
        lat > VE.latMax ||
        lon < VE.lonMin ||
        lon > VE.lonMax
      ) {
        continue;
      }
      quakes.push({
        id: f.id ?? `${lat}:${lon}:${f.properties?.time ?? 0}`,
        mag: typeof f.properties?.mag === "number" ? f.properties.mag : null,
        place: f.properties?.place ?? "Venezuela",
        time: f.properties?.time ?? 0,
        url: f.properties?.url ?? USGS_SOURCE.url,
        lat,
        lon,
        depthKm: typeof depth === "number" ? depth : null,
      });
    }

    quakes.sort((a, b) => b.time - a.time);
    return quakes.slice(0, limit);
  } catch {
    return [];
  }
}
