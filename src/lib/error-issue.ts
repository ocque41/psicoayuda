import "server-only";

export type ErrorIssueInput = {
  message?: string;
  digest?: string;
  path: string;
  referrer?: string;
  userAgent?: string;
  stack?: string;
  lastAction?: { label?: string; href?: string; page?: string } | null;
  when: string;
  authenticated: boolean;
};

const DEFAULT_REPO = "ocque41/psicoayuda";
const LABEL = "error-auto";

// El repo es PÚBLICO: quitamos el query string de cualquier URL para no arrastrar
// datos que pudieran ir en la ruta a un issue público.
function stripQuery(value?: string) {
  return value ? value.split("?")[0].split("#")[0] : "";
}

/**
 * Abre un issue en GitHub con el contexto TÉCNICO de un error de cliente, para que
 * un agente lo diagnostique y proponga un PR. Nunca incluye PII (correo del
 * usuario, query strings): el repo es público; solo va el estado de sesión
 * (anónimo/autenticado) y el error técnico.
 *
 * Desactivado por defecto y best-effort: si no hay `GITHUB_ISSUE_TOKEN`, es no-op
 * (seguro desplegar sin el secreto). Deduplica por `digest`: si ya existe un issue
 * abierto con ese digest, no crea otro.
 */
export async function createErrorIssue(input: ErrorIssueInput) {
  const token = process.env.GITHUB_ISSUE_TOKEN?.trim();
  if (!token) return;
  const repo = process.env.GITHUB_ISSUE_REPO?.trim() || DEFAULT_REPO;
  const digest = input.digest?.trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "nido-error-reporter",
  };

  try {
    // Deduplicación: ¿ya hay un issue abierto con este digest?
    if (digest) {
      const q = encodeURIComponent(
        `repo:${repo} is:issue is:open label:${LABEL} "${digest}"`,
      );
      const found = await fetch(
        `https://api.github.com/search/issues?q=${q}&per_page=1`,
        { headers },
      )
        .then((r) =>
          r.ok ? (r.json() as Promise<{ total_count?: number }>) : null,
        )
        .catch(() => null);
      if (found?.total_count && found.total_count > 0) return;
    }

    const path = stripQuery(input.path) || "—";
    const title =
      `Error automático: ${(input.message || digest || "sin mensaje").slice(0, 90)} · ${path}`.slice(
        0,
        140,
      );
    const la = input.lastAction;
    const lastActionLine = la
      ? `${la.label || "—"} (${stripQuery(la.href) || "—"} en ${stripQuery(la.page) || "—"})`
      : "—";
    const body = [
      "> Issue creado automáticamente cuando un usuario cayó en la página de error. Sin datos personales.",
      "",
      `- **Ruta:** \`${path}\``,
      `- **Mensaje:** ${input.message || "—"}`,
      `- **Digest:** \`${digest || "—"}\``,
      `- **Sesión:** ${input.authenticated ? "usuario autenticado" : "anónimo"}`,
      `- **Última acción:** ${lastActionLine}`,
      `- **Referrer:** \`${stripQuery(input.referrer) || "—"}\``,
      `- **User-Agent:** ${input.userAgent || "—"}`,
      `- **Cuándo:** ${input.when}`,
      "",
      "**Stack:**",
      "```",
      (input.stack || "—").slice(0, 4000),
      "```",
    ].join("\n");

    await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, labels: [LABEL] }),
    });
  } catch {
    // Best-effort: avisar de un error nunca debe romper el flujo del usuario.
  }
}
