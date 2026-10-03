"use server";

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import { linkPatientConversation } from "@/lib/patient/access";
import { mintSeekerToken, SEEKER_COOKIE } from "@/lib/seeker-token";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h

async function getRequesterHash() {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("cf-connecting-ip") ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip");
  if (!ip) return undefined;
  return createHash("sha256").update(`${getAuthSecret()}:${ip}`).digest("hex");
}

/**
 * El seeker pulsa "Hablar con X": crea la conversación + sesión efímera, mintea
 * un token HMAC, lo guarda en una cookie httpOnly y redirige a /c/<id>. Sin
 * cuenta. Rate-limit por requesterHash (3/h). Guarda contra pro no disponible.
 */
export async function createConversation(formData: FormData) {
  const professionalId = String(formData.get("professionalId") ?? "");
  // El contacto directo no posee una solicitud verificada. Su identificador
  // nunca puede venir del formulario público ni conceder acceso a otro caso.
  // Alias opcional ("¿Cómo quieres que te llamemos?"): se muestra al profesional
  // en el aviso "te están escribiendo". Acotado y sin identidad forzada.
  const seekerName =
    String(formData.get("seekerName") ?? "")
      .trim()
      .slice(0, 40) || null;
  // Correo OPCIONAL del chat directo: solo habilita el enlace mágico de
  // re-entrada (/acceso) y el aviso de respuesta. Sin él, la persona conserva
  // la sesión de este navegador.
  const seekerEmailRaw = String(formData.get("seekerEmail") ?? "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  const seekerEmail =
    seekerEmailRaw.includes("@") && !seekerEmailRaw.includes(" ")
      ? seekerEmailRaw
      : null;

  if (!professionalId) redirect("/profesionales");

  const requesterHash = await getRequesterHash();
  const cookieStore = await cookies();
  const now = Date.now();
  const conversationId = newId("conv");
  const sid = newId("seek");
  const timestamp = nowIso();

  const token = mintSeekerToken(
    { sid, conversationId, role: "seeker", iat: now, exp: now + TOKEN_TTL_MS },
    getAuthSecret(),
  );
  // Reserva, hilo y sesión se confirman juntos. El límite de solicitudes también
  // se evalúa dentro de la transacción, antes de crear la sesión nueva.
  const results = await db.batch([
    db.all(sql`UPDATE professionals SET current_active_requests=current_active_requests+1,updated_at=${timestamp}
      WHERE id=${professionalId} AND status='approved' AND accepting_requests=1 AND remote_available=1
        AND current_active_requests < max_active_requests
        AND (${requesterHash ?? null} IS NULL OR (SELECT count(*) FROM seeker_sessions
          WHERE requester_hash=${requesterHash ?? null} AND issued_at >= ${now - 3600000}) < 3)
      RETURNING id`),
    db.all(sql`INSERT INTO conversations (id,professional_id,seeker_sid,seeker_name,seeker_email,status,created_at,updated_at)
      SELECT ${conversationId},${professionalId},${sid},${seekerName},${seekerEmail},'open',${timestamp},${timestamp}
      WHERE changes()=1 RETURNING id`),
    db.all(sql`INSERT INTO seeker_sessions (sid,conversation_id,requester_hash,role,issued_at,expires_at)
      SELECT ${sid},${conversationId},${requesterHash ?? null},'seeker',${now},${now + TOKEN_TTL_MS}
      WHERE changes()=1 AND EXISTS(SELECT 1 FROM conversations WHERE id=${conversationId}) RETURNING sid`),
  ]);
  if (!results[0].length || !results[1].length || !results[2].length)
    redirect("/profesionales");

  cookieStore.set(SEEKER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Path "/" para que la cookie viaje también al upgrade WebSocket en
    // /parties/*; el token está acotado por conversationId, así que solo
    // autoriza esa sala.
    path: "/",
    maxAge: TOKEN_TTL_MS / 1000,
  });

  // Vincular la cuenta es opcional: un fallo no convierte un chat ya creado en
  // un envío fallido ni invita a duplicarlo. Su cookie conserva el acceso.
  try {
    const session = await getServerSession();
    if (session?.user.id)
      await linkPatientConversation(session.user.id, conversationId, token);
  } catch {
    // La persona puede conectar este mismo hilo desde sus ajustes más tarde.
  }

  redirect(`/c/${conversationId}`);
}
