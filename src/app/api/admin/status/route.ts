import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { requireAdmissionReviewer } from "@/lib/admission/access";

// Depende de la sesión (cookies): siempre dinámico y sin caché. Solo devuelve el
// booleano; nunca expone la lista de ADMIN_EMAILS al cliente.
export const dynamic = "force-dynamic";

export async function GET() {
  const [admin, admission] = await Promise.all([
    requireAdmin(),
    requireAdmissionReviewer(),
  ]);
  return NextResponse.json(
    {
      isAdmin: Boolean(admin),
      isSuperAdmin: Boolean(admin),
      isAdmissionReviewer: Boolean(admission),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
