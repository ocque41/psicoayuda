import { NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs, helpRequests } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { toCsvRow } from "@/lib/csv";
import { newId, nowIso } from "@/lib/ids";

// Acota el coste/memoria del export sin importar el tamaño de la tabla.
const MAX_EXPORT_ROWS = 5000;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const rows = await db.select().from(helpRequests).limit(MAX_EXPORT_ROWS);
  const header = [
    "id",
    "email",
    "language",
    "country",
    "state",
    "city",
    "need_category",
    "urgency",
    "status",
    "created_at",
  ];

  const body = [
    toCsvRow(header),
    ...rows.map((row) =>
      toCsvRow([
        row.id,
        row.email,
        row.language,
        row.country,
        row.state,
        row.city,
        row.needCategory,
        row.urgency,
        row.status,
        row.createdAt,
      ]),
    ),
  ].join("\n");

  // Registra el egreso de PII (quién exportó y cuántas filas).
  await db.insert(auditLogs).values({
    id: newId("log"),
    actorEmail: admin.email,
    action: "data_export",
    entityType: "help_request",
    entityId: "csv_export",
    metadata: JSON.stringify({ rows: rows.length }),
    createdAt: nowIso(),
  });

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=nido-solicitudes.csv",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
