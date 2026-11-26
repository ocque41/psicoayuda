import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import {
  currentAdmissionReviewer,
  requireAdmissionReviewer,
} from "@/lib/admission/access";
import { checkFpvNumber, extractFpvNumber } from "@/lib/fpv";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Consulta pública de la FPV para una candidatura clínica pendiente, por su
 * Nº FPV declarado. Solo para quien revisa Admisión. La respuesta nunca
 * incluye la cédula que publica la FPV.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ professionalId: string }> },
) {
  const actor = await requireAdmissionReviewer();
  if (!actor)
    return Response.json(
      { error: "forbidden" },
      { status: 403, headers: privateHeaders },
    );
  const { professionalId } = await params;
  if (!professionalId || professionalId.length > 120)
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: privateHeaders },
    );
  const [candidate] = await db
    .select({
      fpvNumber: professionals.fpvNumber,
      fullName: professionals.fullName,
      university: professionals.university,
    })
    .from(professionals)
    .where(
      and(
        eq(professionals.id, professionalId),
        eq(professionals.status, "pending_verification"),
        eq(professionals.nonClinicalHelper, false),
        currentAdmissionReviewer(actor),
      ),
    )
    .limit(1);
  const fpvNumber = extractFpvNumber(candidate?.fpvNumber);
  if (!candidate || !fpvNumber)
    return Response.json(
      { error: "no_fpv" },
      { status: 404, headers: privateHeaders },
    );
  const result = await checkFpvNumber({
    fpvNumber,
    fullName: candidate.fullName,
    university: candidate.university,
  });
  return Response.json(result, { headers: privateHeaders });
}
