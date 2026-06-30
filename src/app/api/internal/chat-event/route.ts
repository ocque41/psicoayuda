import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { conversations, professionals, responseSamples } from "@/db/schema";
import { newId } from "@/lib/ids";
import { notifyProfessionalNewMessage } from "@/lib/notifications";

// Solo el Durable Object del chat (mismo Worker) llama aquí, con un secreto
// compartido. Centraliza el email y la métrica donde `server-only` es válido.
function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("x-nido-internal");
  const expected =
    process.env.INTERNAL_NOTIFY_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type ChatEvent = {
  kind?: string;
  conversationId?: string;
  responseDeltaMs?: number;
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
      });
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
