import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { professionals } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

const REMIND_AFTER_MS = 24 * 3_600_000;

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ] || character,
  );
}

/** Correo del recordatorio. Sin datos clínicos ni respuestas. */
export function screeningReminderEmailContent(name: string | null) {
  const url = new URL("/pro/cuestionario", SITE_URL).toString();
  const greeting = `Hola${name ? `, ${name}` : ""}:`;
  const paragraphs = [
    "Gracias por registrarte en Nido. Para que el equipo pueda revisar tu solicitud, falta un último paso: responder el cuestionario clínico.",
    "Son preguntas de una en una sobre tu práctica y tus límites de atención; se tarda unos 10 minutos y tu progreso se guarda si lo dejas a medias.",
    "En cuanto lo envíes, revisamos tu perfil y te escribimos con la respuesta.",
  ];
  const cta = "Responder el cuestionario";
  const footer =
    "Si no solicitaste unirte a Nido, puedes ignorar este correo. Para cualquier duda, responde a este mensaje.";
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#2b2723;line-height:1.6;padding:24px"><p style="font-size:14px;color:#245f47">Nido · A tu ritmo</p><h1 style="font-size:24px;color:#245f47">Completa tu solicitud</h1><p>${escapeHtml(greeting)}</p>${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2f7a5b;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none">${escapeHtml(cta)}</a></p><p style="font-size:13px;color:#6e655b">${escapeHtml(footer)}</p></div>`;
  const text = `Completa tu solicitud\n\n${greeting}\n\n${paragraphs.join("\n\n")}\n\n${cta}: ${url}\n\n${footer}`;
  return {
    subject: "Te falta un paso para tu solicitud en Nido",
    html,
    text,
  };
}

/**
 * Recordatorio único a las candidaturas clínicas pendientes que, 24 h después
 * de registrarse, todavía no enviaron el cuestionario. Se reserva el envío en
 * la base antes de mandar el correo, así nunca sale dos veces.
 */
export async function runScreeningReminderJobs(now = Date.now()) {
  const nowStamp = new Date(now).toISOString();
  const cutoff = new Date(now - REMIND_AFTER_MS).toISOString();
  const claimed = await db
    .update(professionals)
    .set({ screeningRemindedAt: nowStamp })
    .where(
      and(
        eq(professionals.status, "pending_verification"),
        lte(professionals.createdAt, cutoff),
        sql`${professionals.screeningRemindedAt} IS NULL`,
        sql`NOT EXISTS (SELECT 1 FROM professional_screenings s WHERE s.professional_id = ${professionals.id} AND s.submitted_at IS NOT NULL)`,
      ),
    )
    .returning({
      id: professionals.id,
      email: professionals.email,
      name: professionals.displayName,
      fullName: professionals.fullName,
    });
  let reminded = 0;
  let failed = 0;
  for (const candidate of claimed) {
    const name = candidate.name || candidate.fullName.split(" ")[0] || null;
    const result = await sendEmail({
      to: candidate.email,
      ...screeningReminderEmailContent(name),
    }).catch(() => ({ ok: false }));
    if (result.ok) {
      reminded++;
      continue;
    }
    failed++;
    // Sin envío confirmado, se libera la reserva para reintentar mañana.
    await db
      .update(professionals)
      .set({ screeningRemindedAt: null })
      .where(
        and(
          eq(professionals.id, candidate.id),
          eq(professionals.screeningRemindedAt, nowStamp),
        ),
      );
  }
  return { reminded, failed };
}
