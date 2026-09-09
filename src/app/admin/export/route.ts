import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { helpRequests } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";

// Bound the export so it cannot scale with total historical rows.
const EXPORT_ROW_LIMIT = 5000;

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const rows = await db
    .select()
    .from(helpRequests)
    .orderBy(desc(helpRequests.createdAt))
    .limit(EXPORT_ROW_LIMIT);
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
    header.join(","),
    ...rows.map((row) =>
      [
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
      ]
        .map(csvEscape)
        .join(","),
    ),
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=nido-solicitudes.csv",
    },
  });
}
