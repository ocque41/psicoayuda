export type PatientSession = { userId: string | null; expiresAt?: number };
export type PatientSessionState = {
  status: "checking" | "authorized" | "unavailable" | "revoked";
  accountPresent?: boolean;
};

/** Una señal de cierre/cambio es terminal para el contenido RSC de ese dueño. */
export function createPatientSessionBoundary(
  ownerId: string,
  read: (signal: AbortSignal) => Promise<PatientSession>,
  changed: (state: PatientSessionState) => void,
) {
  let revision = 0;
  let ended = false;
  let disposed = false;
  let request: AbortController | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function cancelRequest() {
    revision += 1;
    request?.abort();
    clearTimeout(timeout);
  }
  function end() {
    if (disposed) return;
    ended = true;
    cancelRequest();
    clearTimeout(expiry);
    changed({ status: "revoked" });
  }
  async function check() {
    if (disposed) return;
    cancelRequest();
    const ticket = revision;
    const pending = new AbortController();
    request = pending;
    timeout = setTimeout(() => pending.abort(), 10_000);
    changed({ status: ended ? "revoked" : "checking" });
    try {
      const session = await read(pending.signal);
      if (disposed || ticket !== revision) return;
      if (
        ended ||
        session.userId !== ownerId ||
        !Number.isFinite(session.expiresAt) ||
        (session.expiresAt ?? 0) <= Date.now()
      ) {
        ended = true;
        clearTimeout(expiry);
        changed({
          status: "revoked",
          accountPresent: Boolean(session.userId),
        });
        return;
      }
      changed({ status: "authorized" });
      clearTimeout(expiry);
      expiry = setTimeout(
        end,
        Math.min((session.expiresAt ?? 0) - Date.now(), 2_147_483_647),
      );
    } catch {
      if (!disposed && ticket === revision)
        changed({ status: ended ? "revoked" : "unavailable" });
    } finally {
      if (ticket === revision) clearTimeout(timeout);
    }
  }
  return {
    check,
    end,
    pause() {
      if (disposed) return;
      cancelRequest();
      changed({ status: ended ? "revoked" : "checking" });
    },
    dispose() {
      disposed = true;
      cancelRequest();
      clearTimeout(expiry);
    },
  };
}

/** Consulta la sesión vigente en BD, sin reutilizar la caché de cookies. */
export async function readCurrentPatientSession(
  signal: AbortSignal,
): Promise<PatientSession> {
  const response = await fetch("/api/patient/session", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("No se pudo comprobar la sesión.");
  const data = await response.json();
  if (data === null) return { userId: null };
  if (typeof data?.userId !== "string" || typeof data?.expiresAt !== "number")
    throw new Error("Respuesta de sesión incompleta.");
  const expiresAt = data.expiresAt;
  if (!Number.isFinite(expiresAt))
    throw new Error("Caducidad de sesión inválida.");
  return { userId: data.userId, expiresAt };
}
