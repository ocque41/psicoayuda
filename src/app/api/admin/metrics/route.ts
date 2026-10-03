import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { readAdminMetrics } from "@/lib/admin-metrics";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
};

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json(
        {
          error: "Tu sesión no tiene permiso para consultar estas métricas.",
          code: "not_authorized",
        },
        { status: 401, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(await readAdminMetrics(), {
      headers: PRIVATE_HEADERS,
    });
  } catch {
    // Plantilla fija: nunca registrar consultas, etiquetas, identidad o errores crudos.
    console.error("[admin_metrics] lectura no disponible");
    return NextResponse.json(
      {
        error: "No se pudieron cargar las métricas. Inténtalo de nuevo.",
        code: "metrics_unavailable",
      },
      { status: 503, headers: { ...PRIVATE_HEADERS, "Retry-After": "5" } },
    );
  }
}
