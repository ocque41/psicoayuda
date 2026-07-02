"use server";

import { getServerSession } from "@/lib/auth-server";
import { createErrorIssue } from "@/lib/error-issue";
import { notifyAdminClientError } from "@/lib/notifications";

export type ClientErrorReport = {
  message?: string;
  digest?: string;
  stack?: string;
  path?: string;
  referrer?: string;
  userAgent?: string;
  lastAction?: { label?: string; href?: string; page?: string } | null;
};

function clamp(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * La página de error (client component) llama a esto al montar para avisar a los
 * admins. Endpoint público: la sesión se resuelve EN EL SERVIDOR (no confiamos en
 * el cliente para el "quién") y todo el resto se recorta antes de reenviarlo.
 *
 * ponytail: sin rate-limit de servidor; el cliente deduplica por sesión
 * (digest+ruta). Si un crawler o un bucle de error inunda el buzón, añade un
 * rate-limit en KV/D1 aquí.
 */
export async function reportClientError(report: ClientErrorReport) {
  const session = await getServerSession().catch(() => null);
  const authenticated = Boolean(session?.user?.id);
  const userLabel = session?.user?.email
    ? `${session.user.email}${session.user.id ? ` (${session.user.id})` : ""}`
    : "anónimo (sin sesión)";

  const action = report.lastAction;
  const shared = {
    path: clamp(report.path, 300) || "—",
    message: clamp(report.message, 500),
    digest: clamp(report.digest, 120),
    referrer: clamp(report.referrer, 300),
    userAgent: clamp(report.userAgent, 300),
    stack: clamp(report.stack, 2000),
    lastAction: action
      ? {
          label: clamp(action.label, 160),
          href: clamp(action.href, 300),
          page: clamp(action.page, 300),
        }
      : null,
    when: new Date().toISOString(),
  };

  // Aviso por correo (incluye al usuario) e issue en GitHub (SIN PII, para que un
  // agente proponga el arreglo). Ambos best-effort e independientes: si uno falla
  // no afecta al otro ni al flujo del usuario.
  await Promise.allSettled([
    notifyAdminClientError({ userLabel, ...shared }),
    createErrorIssue({ ...shared, authenticated }),
  ]);
}
