import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import {
  currentAdmissionReviewer,
  requireAdmissionReviewer,
} from "@/lib/admission/access";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ professionalId: string }> },
) {
  const actor = await requireAdmissionReviewer();
  if (!actor)
    return new Response("Acceso restringido", {
      status: 403,
      headers: privateHeaders,
    });
  const { professionalId } = await params;
  if (!professionalId || professionalId.length > 120)
    return new Response("Comprobante no disponible", {
      status: 404,
      headers: privateHeaders,
    });
  const [candidate] = await db
    .select({ document: professionals.registrationProofDoc })
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.status, "pending_verification"),
        eq(professionals.nonClinicalHelper, false),
        sql`${professionals.registrationProofDoc} IS NOT NULL AND length(${professionals.registrationProofDoc})<=3000000`,
        currentAdmissionReviewer(actor),
      ),
    )
    .limit(1);
  const encoded = candidate?.document;
  if (!encoded || encoded.length > 3_000_000)
    return new Response("Comprobante no disponible", {
      status: 404,
      headers: privateHeaders,
    });
  const match = encoded.match(
    /^data:(application\/pdf|image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match || match[2].length % 4 !== 0)
    return new Response("Comprobante no disponible", {
      status: 404,
      headers: privateHeaders,
    });
  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      ...privateHeaders,
      "Content-Type": match[1],
      "Content-Disposition": "inline; filename=comprobante",
    },
  });
}
