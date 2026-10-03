import { NextResponse } from "next/server";
import { appointmentActor, dailyRequest } from "@/lib/practice/calls";
import { filesForAppointment } from "@/lib/practice/media";
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ appointmentId: string; type: string; fileId: string }>;
  },
) {
  const { appointmentId, type, fileId } = await params;
  const actor = await appointmentActor(appointmentId);
  if (!actor || !["recording", "transcript"].includes(type))
    return new Response("No disponible", { status: 404 });
  try {
    const files = await filesForAppointment(appointmentId);
    if (!files.some((f) => f.id === fileId && f.type === type && f.ready))
      return new Response("No disponible", { status: 404 });
    const link = await dailyRequest<{ download_link: string }>(
      `/${type === "recording" ? "recordings" : "transcript"}/${encodeURIComponent(fileId)}/access-link${type === "recording" ? "?valid_for_secs=900" : ""}`,
    );
    const url = new URL(link.download_link);
    if (url.protocol !== "https:") throw new Error("Enlace inválido");
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return new Response("No pudimos abrir el archivo. Vuelve a intentarlo.", {
      status: 503,
    });
  }
}
