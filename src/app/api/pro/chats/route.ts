import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { conversationsForProfessional } from "@/lib/offers";
import { sortProChats, toProChatSummaries } from "@/lib/pro-chats";

// La bandeja del profesional (metadatos, sin contenido) para el refresco en
// vivo de la lista de conversaciones del chat. Sin caché: es lo que hace que la
// lista se sienta en tiempo real.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ chats: [] }, { status: 401 });
  }

  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.userId, session.user.id),
  });
  if (!pro || pro.status === "suspended") {
    return NextResponse.json({ chats: [] }, { status: 403 });
  }

  const rows = await conversationsForProfessional(pro.id);
  return NextResponse.json(
    { chats: sortProChats(toProChatSummaries(rows)) },
    { headers: { "cache-control": "no-store" } },
  );
}
