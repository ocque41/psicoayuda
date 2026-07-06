import { timingSafeEqual } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";

// Informe de clics cada 12h. Lo dispara el cron de Cloudflare
// (custom-worker.ts `scheduled()`) con el secreto interno, igual que retention.
//
// Destinatarios FIJOS a propósito. NUNCA @implicacf.com (prohibido enviar ahí).
const REPORT_TO = ["martinezra02@gmail.com", "ocquema@hotmail.com"];

function isAuthorized(request: Request): boolean {
  const provided = request.headers.get("x-nido-internal");
  const expected =
    process.env.INTERNAL_NOTIFY_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Count = { s: string; n: number };

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as { DB?: D1Database }).DB;
    if (!db) {
      return NextResponse.json({ ok: false, error: "sin binding DB" });
    }

    const since = Date.now() - 12 * 60 * 60 * 1000;
    const noTest = "(label IS NULL OR label != 'VERIF-DESPLIEGUE')";
    const all = async (sql: string) =>
      ((await db.prepare(sql).bind(since).all()).results ?? []) as Count[];

    const total =
      (await db
        .prepare(
          `SELECT COUNT(*) AS n FROM click_events WHERE created_at >= ? AND ${noTest}`,
        )
        .bind(since)
        .first<number>("n")) ?? 0;

    const bySource = await all(
      `SELECT COALESCE(utm_source,'directo') AS s, COUNT(*) AS n FROM click_events WHERE created_at >= ? AND ${noTest} GROUP BY s ORDER BY n DESC`,
    );
    const byType = await all(
      `SELECT type AS s, COUNT(*) AS n FROM click_events WHERE created_at >= ? AND ${noTest} GROUP BY s ORDER BY n DESC`,
    );
    // Contactos a psicólogos: clics a WhatsApp/llamada con nombre, excluyendo
    // recursos y aliados (Guardianes, FUNDANA, líneas sueltas).
    const psych = await all(
      `SELECT label AS s, COUNT(*) AS n FROM click_events WHERE created_at >= ?
       AND (href LIKE 'https://wa.me/%' OR href LIKE 'tel:%') AND label IS NOT NULL
       AND page IN ('/ayuda','/profesionales','/')
       AND label NOT LIKE '%Guardianes%' AND label NOT LIKE '%Francys%' AND label NOT LIKE '%0424%'
       GROUP BY s ORDER BY n DESC LIMIT 12`,
    );
    // Aliados y recursos externos: clics a los contactos/webs de las
    // asociaciones (/alianzas), los recursos (/recursos) y cualquier enlace
    // externo (etiqueta con ↗). Agrupado por lo que se pulsó.
    const aliados = await all(
      `SELECT label AS s, COUNT(*) AS n FROM click_events WHERE created_at >= ?
       AND label IS NOT NULL
       AND (type = 'aliado'
            OR (type = 'outbound' AND (page IN ('/alianzas','/recursos') OR label LIKE '%↗%')))
       GROUP BY s ORDER BY n DESC LIMIT 15`,
    );

    const li = (rows: Count[]) =>
      rows.length
        ? rows.map((r) => `• ${r.s}: ${r.n}`).join("\n")
        : "• (sin datos)";
    const liHtml = (rows: Count[]) =>
      rows.length
        ? rows.map((r) => `<li>${r.s}: <strong>${r.n}</strong></li>`).join("")
        : "<li>(sin datos)</li>";

    const subject = `📊 Informe Nido — ${total} clics (12h)`;
    const text = `INFORME NIDO — últimas 12h

Total: ${total} clics

Origen:
${li(bySource)}

Tipo:
${li(byType)}

Psicólogos contactados por WhatsApp:
${li(psych)}

Aliados y recursos externos (clics a sus contactos/webs):
${li(aliados)}

— Nido · saludmental-venezuela.com`;

    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">
<h2 style="margin:0 0 2px">📊 Informe Nido</h2>
<p style="color:#6e655b;margin:0 0 14px">Últimas 12 horas</p>
<p style="font-size:22px;font-weight:700;margin:0 0 14px">${total} clics</p>
<p style="margin:0 0 2px"><strong>Origen</strong></p><ul style="margin:0 0 14px">${liHtml(bySource)}</ul>
<p style="margin:0 0 2px"><strong>Tipo</strong></p><ul style="margin:0 0 14px">${liHtml(byType)}</ul>
<p style="margin:0 0 2px"><strong>Psicólogos contactados por WhatsApp</strong></p><ul style="margin:0 0 14px">${liHtml(psych)}</ul>
<p style="margin:0 0 2px"><strong>Aliados y recursos externos</strong> (clics a sus contactos/webs)</p><ul style="margin:0 0 14px">${liHtml(aliados)}</ul>
<p style="color:#6e655b;font-size:13px;border-top:1px solid #eee;padding-top:12px">Informe automático cada 12h · Nido</p>
</div>`;

    for (const to of REPORT_TO) {
      await sendEmail({ to, subject, html, text });
    }

    return NextResponse.json({ ok: true, total, recipients: REPORT_TO.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 },
    );
  }
}
