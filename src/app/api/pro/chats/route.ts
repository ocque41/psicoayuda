import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { loadLiveChatProfessional } from "@/lib/chat-professional-session";
import { conversationsForProfessional } from "@/lib/offers";
import { sortProChats, toProChatSummaries } from "@/lib/pro-chats";

// La bandeja del profesional (metadatos, sin contenido) para el refresco en
// vivo de la lista de conversaciones del chat. Sin caché: es lo que hace que la
// lista se sienta en tiempo real.
export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store", Vary: "Cookie" };
export async function GET(request?: Request): Promise<Response> {
  const session = await getServerSession();
  if (!session?.user?.id || !session.session?.id) {
    return NextResponse.json({ chats: [] }, { status: 401, headers });
  }

  const expectedProfessionalId = request
    ? new URL(request.url).searchParams.get("professionalId") || undefined
    : undefined;
  const live = await loadLiveChatProfessional(expectedProfessionalId);
  if (
    !live ||
    live.userId !== session.user.id ||
    live.authSessionId !== session.session.id
  ) {
    return NextResponse.json({ chats: [] }, { status: 403, headers });
  }

  const rows = await conversationsForProfessional(live.professional.id, {
    userId: live.userId,
    authSessionId: live.authSessionId,
  });
  return NextResponse.json(
    {
      professionalId: live.professional.id,
      chats: sortProChats(toProChatSummaries(rows)),
    },
    { headers },
  );
}
