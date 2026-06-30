"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { getFeedProfessionals } from "@/lib/feed";
import { notifySeekerOfferAccepted } from "@/lib/notifications";
import { acceptOffer, offerRequestToProfessionals } from "@/lib/offers";

/**
 * El solicitante difunde su solicitud: a TODOS los profesionales disponibles
 * (mode=all) o a los que seleccionó (mode=selected). Sin cuenta. Redirige a la
 * confirmación con cuántas ofertas se enviaron.
 */
export async function sendRequestToProfessionals(formData: FormData) {
  const helpRequestId = String(formData.get("helpRequestId") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!helpRequestId) redirect("/ayuda");

  let professionalIds: string[];
  if (mode === "all") {
    const feed = await getFeedProfessionals();
    professionalIds = feed.map((p) => p.id);
  } else {
    professionalIds = formData
      .getAll("professionalIds")
      .map(String)
      .filter(Boolean);
  }

  if (professionalIds.length === 0) {
    redirect(`/ayuda/gracias?solicitud=${helpRequestId}&sin_seleccion=1`);
  }

  const sent = await offerRequestToProfessionals(
    helpRequestId,
    professionalIds,
  );
  redirect(`/ayuda/gracias?solicitud=${helpRequestId}&enviado=${sent}`);
}

/**
 * Un profesional (logueado) acepta una solicitud que le ofrecieron. Abre la
 * conversación, avisa al solicitante por correo con un enlace de acceso y lleva
 * al profesional directo al chat.
 */
export async function acceptRequestOffer(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) redirect("/pro/dashboard");

  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) redirect("/pro");

  const professional = await db.query.professionals.findFirst({
    where: eq(professionals.userId, userId),
  });
  if (!professional) redirect("/pro/onboarding");

  const result = await acceptOffer({
    assignmentId,
    professionalId: professional.id,
    actorEmail: professional.email,
  });

  if (!result.ok) {
    const reason = result.reason === "capacity_or_status" ? "cupo" : "no_disp";
    redirect(`/pro/dashboard?oferta=${reason}`);
  }

  if (result.seekerEmail) {
    await notifySeekerOfferAccepted({
      seekerEmail: result.seekerEmail,
      conversationId: result.conversationId,
      accessToken: result.seekerToken,
    });
  }

  redirect(`/c/${result.conversationId}`);
}
