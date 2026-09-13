import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";

/**
 * Foto pública de un profesional aprobado, servida como imagen cacheable.
 *
 * Las fotos viven en D1 como data URL; incrustarlas en el HTML engordaba las
 * listas públicas (portada y directorio). Aquí se devuelven como bytes con
 * caché larga: la URL incluye `?v=<hash>` en el feed, así que un cambio de foto
 * usa una URL nueva y el navegador no muestra una versión vieja.
 *
 * Solo perfiles aprobados: si la cuenta se suspende, su foto deja de servirse.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id || id.length > 100) {
    return new Response("No encontrado", { status: 404 });
  }

  let photo: string | null | undefined;
  try {
    const rows = await db
      .select({ photo: professionals.photo })
      .from(professionals)
      .where(
        and(eq(professionals.id, id), eq(professionals.status, "approved")),
      )
      .limit(1);
    photo = rows[0]?.photo;
  } catch {
    return new Response("No disponible", { status: 503 });
  }

  if (!photo) return new Response("No encontrado", { status: 404 });

  // Fotos subidas como URL externa (casos antiguos): redirigir sin cachear.
  if (!photo.startsWith("data:")) {
    return /^https?:\/\//i.test(photo)
      ? Response.redirect(photo, 302)
      : new Response("No encontrado", { status: 404 });
  }

  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
    photo,
  );
  if (!match) return new Response("No encontrado", { status: 404 });

  let bytes: Uint8Array;
  try {
    const binary = atob(match[2].replace(/\s+/g, ""));
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return new Response("No encontrado", { status: 404 });
  }

  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      "content-type": match[1],
      "content-length": String(bytes.byteLength),
      // URL versionada por hash: puede cachearse indefinidamente.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
