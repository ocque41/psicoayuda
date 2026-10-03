import { getServerSession } from "@/lib/auth-server";
import { patientExportChunks } from "@/lib/patient/export";
export async function GET() {
  const session = await getServerSession();
  if (!session?.user.id)
    return new Response("Inicia sesión para descargar tus datos.", {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  const chunks = patientExportChunks(session.user.id),
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
