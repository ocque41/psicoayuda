"use server";

import { createHash } from "node:crypto";
import { and, count, eq, gte, isNull, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accessRequests, conversations, helpRequests } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { newId } from "@/lib/ids";
import { notifySeekerAccessLinks } from "@/lib/notifications";
import { createSeekerAccessLink } from "@/lib/seeker-access";

// Hasta 5 conversaciones por correo (evita correos gigantes y enumeración).
const MAX_LINKS = 5;
// 3 solicitudes por correo y hora (independiente de la IP).
const RATE_LIMIT_PER_HOUR = 3;

function hashWithSecret(value: string): string {
  return createHash("sha256")
    .update(`${getAuthSecret()}:${value}`)
    .digest("hex");
}

async function getRequesterHash(): Promise<string | undefined> {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("cf-connecting-ip") ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip");
  if (!ip) return undefined;
  return hashWithSecret(ip);
}

function formatWhen(value: Date | string | null): string {
  if (!value) return "hace poco";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "hace poco";
  try {
    return new Intl.DateTimeFormat("es-VE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Enlace mágico de re-entrada: la persona escribe su correo y le enviamos (si
 * hay conversaciones vivas) enlaces frescos a cada una. Sin cuentas.
 *
 * Privacidad: respuesta SIEMPRE neutra (`/acceso?enviado=1`) tanto si hay
 * conversaciones como si no, para no revelar qué correos existen. Solo se
 * guardan hashes y se limita a 3 solicitudes/hora por correo.
 */
export async function requestAccessLinks(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || email.length > 254 || !email.includes("@")) {
    redirect("/acceso?error=correo");
  }

  const emailHash = hashWithSecret(email);
  const requesterHash = await getRequesterHash();

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ total: count() })
    .from(accessRequests)
    .where(
      and(
        eq(accessRequests.emailHash, emailHash),
        gte(accessRequests.createdAt, oneHourAgo),
      ),
    );
  if ((recent?.total ?? 0) >= RATE_LIMIT_PER_HOUR) {
    redirect("/acceso?enviado=1");
  }

  const activityOrder = sql`coalesce(${conversations.lastMessageAt}, cast(strftime('%s', ${conversations.createdAt}) as integer) * 1000) desc`;

  // Conversaciones vivas del correo: por solicitud (/ayuda)…
  const byRequest = await db
    .select({
      id: conversations.id,
      helpRequestId: conversations.helpRequestId,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .innerJoin(helpRequests, eq(conversations.helpRequestId, helpRequests.id))
    .where(
      and(eq(helpRequests.email, email), isNull(conversations.anonymizedAt)),
    )
    .orderBy(activityOrder)
    .limit(MAX_LINKS);

  // …o por correo opcional del chat directo.
  const byDirect = await db
    .select({
      id: conversations.id,
      helpRequestId: conversations.helpRequestId,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.seekerEmail, email),
        isNull(conversations.anonymizedAt),
      ),
    )
    .orderBy(activityOrder)
    .limit(MAX_LINKS);

  const unique = new Map<
    string,
    {
      id: string;
      helpRequestId: string | null;
      lastMessageAt: Date | null;
      createdAt: string;
    }
  >();
  for (const conversation of [...byRequest, ...byDirect]) {
    unique.set(conversation.id, conversation);
  }
  const targets = [...unique.values()].slice(0, MAX_LINKS);

  // Se registra el intento (hash, no correo) para el límite por hora.
  await db.insert(accessRequests).values({
    id: newId("acc"),
    emailHash,
    requesterHash,
  });

  if (targets.length > 0) {
    const links: Array<{ url: string; when: string }> = [];
    for (const target of targets) {
      const link = await createSeekerAccessLink({
        conversationId: target.id,
        helpRequestId: target.helpRequestId,
      });
      links.push({
        url: link.url,
        when: formatWhen(target.lastMessageAt ?? target.createdAt),
      });
    }
    await notifySeekerAccessLinks({ seekerEmail: email, links });
  }

  redirect("/acceso?enviado=1");
}
