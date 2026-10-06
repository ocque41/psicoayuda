import { getServerSession } from "@/lib/auth-server";
import { patientExportChunks } from "@/lib/patient/export";
import { withPatientPushExport } from "@/lib/push/export";
import { authorizedPushActor } from "@/lib/push/preferences";
export async function GET() {
  const session = await getServerSession();
  if (!session?.user.id || !session.user.emailVerified || !session.session.id)
    return new Response("Inicia sesión para descargar tus datos.", {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  const actor = {
    userId: session.user.id,
    sessionId: session.session.id,
    role: "patient" as const,
  };
  if (!(await authorizedPushActor(actor)))
    return new Response("Tu espacio de paciente no está disponible.", {
      status: 403,
      headers: { "cache-control": "private, no-store" },
    });
  const chunks = withPatientPushExport(
      actor,
      patientExportChunks(session.user.id),
    ),
    encoder = new TextEncoder();
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch {
        controller.error(
          new Error("No pudimos completar la descarga. Vuelve a intentarlo."),
        );
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="nido-mis-datos.json"',
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
    },
  });
}
