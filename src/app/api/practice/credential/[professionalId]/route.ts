import { eq } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { requirePracticeStaff } from "@/lib/practice/staff";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ professionalId: string }> },
) {
  if (!(await requirePracticeStaff("credentials")))
    return new Response("Acceso restringido", { status: 403 });
  const { professionalId } = await params;
  const pro = await db.query.professionals.findFirst({
    where: eq(professionals.id, professionalId),
    columns: { registrationProofDoc: true },
  });
  const match = pro?.registrationProofDoc?.match(
    /^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) return new Response("Comprobante no disponible", { status: 404 });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      "Content-Type": match[1],
      "Content-Disposition": "inline; filename=comprobante",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
