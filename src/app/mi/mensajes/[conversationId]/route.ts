import { and, eq, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { patientConversationLinks } from "@/db/patient-schema";
import { conversations } from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { getServerSession } from "@/lib/auth-server";
import { newId } from "@/lib/ids";
import { hasPatientConversationAccess } from "@/lib/patient/access";
import { SEEKER_SESSION_TTL_MS } from "@/lib/seeker-access";
import { mintSeekerToken, SEEKER_COOKIE } from "@/lib/seeker-token";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await getServerSession();
  const { conversationId } = await params;
  if (!session?.user.id)
    return NextResponse.redirect(new URL("/pro?next=%2Fmi", request.url));
  if (!(await hasPatientConversationAccess(session.user.id, conversationId)))
    return new NextResponse("No encontramos esta conversación en tu cuenta.", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  const chat = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      isNull(conversations.anonymizedAt),
      isNull(conversations.deletedAt),
    ),
    columns: { id: true, helpRequestId: true },
  });
  if (!chat) return NextResponse.redirect(new URL("/mi/mensajes", request.url));
  const now = Date.now(),
    expiresAt = now + SEEKER_SESSION_TTL_MS,
    sid = newId("seek");
  const registered = await db.values<[string]>(
    sql`INSERT INTO seeker_sessions (sid,conversation_id,role,issued_at,expires_at,last_seen_at) SELECT ${sid},c.id,'seeker',${now},${expiresAt},${now} FROM patient_conversation_links l JOIN conversations c ON c.id=l.conversation_id JOIN patient_accounts a ON a.user_id=l.user_id WHERE l.user_id=${session.user.id} AND c.id=${conversationId} AND a.deletion_state='active' AND c.deleted_at IS NULL AND c.anonymized_at IS NULL RETURNING sid`,
  );
  if (!registered.length)
    return NextResponse.redirect(new URL("/mi/mensajes", request.url));
  await db
    .update(patientConversationLinks)
    .set({ lastReadAt: new Date(now) })
    .where(
      and(
        eq(patientConversationLinks.userId, session.user.id),
        eq(patientConversationLinks.conversationId, conversationId),
      ),
    );
  const response = NextResponse.redirect(
    new URL(
      `/c/${encodeURIComponent(conversationId)}?como=persona`,
      request.url,
    ),
  );
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-robots-tag", "noindex");
  response.cookies.set(
    SEEKER_COOKIE,
    mintSeekerToken(
      {
        sid,
        conversationId,
        helpRequestId: chat.helpRequestId || undefined,
        role: "seeker",
        iat: now,
        exp: expiresAt,
      },
      getAuthSecret(),
    ),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SEEKER_SESSION_TTL_MS / 1000,
    },
  );
  return response;
}
