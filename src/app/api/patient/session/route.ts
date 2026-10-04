import { getServerSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
const headers = {
  "cache-control": "private, no-store",
  vary: "Cookie",
  "x-content-type-options": "nosniff",
};

/** Sólo metadatos de la sesión propia; getServerSession consulta BD sin cookie cache. */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user.id) return Response.json(null, { headers });
    const expiresAt = session.session.expiresAt.getTime();
    if (!Number.isFinite(expiresAt)) throw new Error("Caducidad inválida.");
    return Response.json({ userId: session.user.id, expiresAt }, { headers });
  } catch {
    return Response.json(
      { error: "No pudimos comprobar tu sesión." },
      { status: 503, headers },
    );
  }
}
