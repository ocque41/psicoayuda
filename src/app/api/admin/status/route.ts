import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

// Depende de la sesión (cookies): siempre dinámico y sin caché. Solo devuelve el
// booleano; nunca expone la lista de ADMIN_EMAILS al cliente.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  return NextResponse.json(
    { isAdmin: Boolean(admin) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
