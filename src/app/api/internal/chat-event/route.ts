import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  conversations,
  helpRequests,
  professionals,
  responseSamples,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  notifyProfessionalNewMessage,
  notifySeekerNewMessage,
} from "@/lib/notifications";
import { createSeekerAccessLink } from "@/lib/seeker-access";

// Solo el Durable Object del chat (mismo Worker) llama aquí, con un secreto
// compartido. Centraliza el email y la métrica donde `server-only` es válido.
// Preferimos un secreto dedicado (INTERNAL_NOTIFY_SECRET); el fallback a
// BETTER_AUTH_SECRET es solo conveniencia para despliegues de un único secreto.
function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("x-nido-internal");
  const expected =
    process.env.INTERNAL_NOTIFY_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!provided || !expected) return false;
  // Hash a longitud fija (32 bytes) antes de comparar: timingSafeEqual SIEMPRE
  // se ejecuta sobre buffers de igual tamaño (sin oráculo de longitud, sin
  // cortocircuito que filtre por tiempo la longitud del secreto).
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

type ChatEvent = {
  kind?: string;
  conversationId?: string;
  responseDeltaMs?: number;
  lastMessageAt?: number;
  lastMessageRole?: string;
};

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: ChatEvent;
  try {
    body = (await request.json()) as ChatEvent;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const conversationId = body.conversationId;
  if (!conversationId) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const conversation = await db.query.conversations.findFirst({
    where: eq(conversations.id, conversationId),
  });
  if (!conversation) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (body.kind === "notify-message") {
    const professional = await db.query.professionals.findFirst({
      where: eq(professionals.id, conversation.professionalId),
    });
    if (professional?.email) {
      await notifyProfessionalNewMessage({
        professionalEmail: professional.email,
        professionalName: professional.displayName ?? professional.fullName,
        conversationId,
        seekerLabel: conversation.seekerName ?? undefined,
      });
    }
    return NextResponse.json({ ok: true });
  }

  // Espejo de METADATOS del DO a D1 (timestamp + rol del último mensaje). El
  // contenido JAMÁS sale del SQLite del Durable Object; esto solo habilita la
  // bandeja del profesional (orden por actividad + badge de no leído).
  if (body.kind === "message-meta") {
    const role =
      body.lastMessageRole === "professional"
        ? "professional"
        : body.lastMessageRole === "seeker"
          ? "seeker"
          : null;
    const at =
      typeof body.lastMessageAt === "number" &&
      Number.isFinite(body.lastMessageAt)
        ? new Date(body.lastMessageAt)
        : null;
    if (role && at) {
      await db
        .update(conversations)
        .set({ lastMessageAt: at, lastMessageRole: role })
        .where(eq(conversations.id, conversationId));
    }
    return NextResponse.json({ ok: true });
  }

  // Avisa a la persona sin cuenta de que su acompañante respondió, con un
  // enlace de acceso renovado (sin contenido). Solo si hay correo: en el chat
  // directo es opcional y puede no existir.
  if (body.kind === "notify-seeker") {
    if (conversation.anonymizedAt || conversation.status === "anonymized") {
      return NextResponse.json({ ok: true });
    }
    const request = conversation.helpRequestId
      ? await db.query.helpRequests.findFirst({
          where: eq(helpRequests.id, conversation.helpRequestId),
        })
      : null;
    const seekerEmail = conversation.seekerEmail ?? request?.email ?? null;
    if (seekerEmail) {
      const link = await createSeekerAccessLink({
        conversationId,
        helpRequestId: conversation.helpRequestId,
      });
      await notifySeekerNewMessage({ seekerEmail, accessUrl: link.url });
    }
    return NextResponse.json({ ok: true });
  }

  if (
    body.kind === "response-sample" &&
    typeof body.responseDeltaMs === "number"
  ) {
    await db
      .insert(responseSamples)
      .values({
        id: newId("rs"),
        professionalId: conversation.professionalId,
        conversationId,
        responseDeltaMs: Math.max(0, Math.round(body.responseDeltaMs)),
        answered: true,
        sampledAt: new Date(),
      })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
