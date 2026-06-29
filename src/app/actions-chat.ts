"use server";

import { createHash } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { conversations, professionals, seekerSessions } from "@/db/schema";
import { newId, nowIso } from "@/lib/ids";
import { mintSeekerToken, SEEKER_COOKIE } from "@/lib/seeker-token";

const TOKEN_TTL_MS = 72 * 60 * 60 * 1000; // 72h

async function getRequesterHash() {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("cf-connecting-ip") ||
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip");
  if (!ip) return undefined;
  return createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET ?? "local"}:${ip}`)
    .digest("hex");
}

async function isOpenRateLimited(requesterHash?: string) {
  if (!requesterHash) return false;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [row] = await db
    .select({ total: count() })
    .from(seekerSessions)
    .where(
      and(
        eq(seekerSessions.requesterHash, requesterHash),
        gte(seekerSessions.issuedAt, oneHourAgo),
      ),
    );
  return (row?.total ?? 0) >= 3;
}

/**
 * El seeker pulsa "Hablar con X": crea la conversación + sesión efímera, mintea
 * un token HMAC, lo guarda en una cookie httpOnly y redirige a /c/<id>. Sin
 * cuenta. Rate-limit por requesterHash (3/h). Guarda contra pro no disponible.
 */
export async function createConversation(formData: FormData) {
  const professionalId = String(formData.get("professionalId") ?? "");
  const helpRequestId = formData.get("helpRequestId")
    ? String(formData.get("helpRequestId"))
    : undefined;

  if (!professionalId) redirect("/profesionales");

  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.id, professionalId),
  });
  if (!professional) redirect("/profesionales");
  if (
    professional.status !== "approved" ||
    !professional.acceptingRequests ||
    professional.currentActiveRequests >= professional.maxActiveRequests
  ) {
    redirect("/profesionales");
  }

  const requesterHash = await getRequesterHash();
  if (await isOpenRateLimited(requesterHash)) {
    redirect("/profesionales");
  }

  const now = Date.now();
  const conversationId = newId("conv");
  const sid = newId("seek");
  const timestamp = nowIso();

  await db.insert(conversations).values({
    id: conversationId,
    helpRequestId,
    professionalId,
    seekerSid: sid,
    status: "open",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await db.insert(seekerSessions).values({
    sid,
    conversationId,
    requesterHash,
    role: "seeker",
    issuedAt: new Date(now),
    expiresAt: new Date(now + TOKEN_TTL_MS),
  });

  const secret =
    process.env.BETTER_AUTH_SECRET ??
    "psicoayuda-local-development-secret-change-me";
  const token = mintSeekerToken(
    { sid, conversationId, helpRequestId, role: "seeker", iat: now, exp: now + TOKEN_TTL_MS },
    secret,
  );

  const cookieStore = await cookies();
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

  redirect(`/c/${conversationId}`);
}
