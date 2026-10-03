import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { inboxSummary } from "@/lib/practice/queries";
export async function GET() {
  const session = await getServerSession();
  if (!session?.user.id) return new Response("Entra de nuevo", { status: 401 });
  const pro = await db.query.professionals.findFirst({
    where: and(
      eq(professionals.userId, session.user.id),
      eq(professionals.status, "approved"),
    ),
    columns: { id: true },
  });
  if (!pro) return new Response("No autorizado", { status: 403 });
  return Response.json(await inboxSummary(pro.id), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
