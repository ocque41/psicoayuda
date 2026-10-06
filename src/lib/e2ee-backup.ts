import {
  createRecoveryBackup,
  getStoredRecoveryCode,
  refreshRecoveryBackup,
} from "@/lib/e2ee-client";

export type BackupResult =
  | { ok: true; code: string; created: boolean }
  | { ok: false };
/** Ningún código se presenta como recuperable antes de que el servidor confirme el respaldo. */
export async function persistRecoveryBackup(
  kind: "professional" | "seeker",
  save: (
    id: string,
    wrapped: string,
    kind: "professional" | "seeker",
  ) => Promise<{ ok: boolean }>,
  scope?: string,
): Promise<BackupResult> {
  try {
    const stored = await getStoredRecoveryCode(scope);
    const backup = stored
      ? await refreshRecoveryBackup(scope)
      : await createRecoveryBackup(scope);
    if (!backup) return { ok: false };
    const code = stored ?? ("code" in backup ? backup.code : null);
    if (typeof code !== "string") return { ok: false };
    const result = await save(backup.id, backup.wrapped, kind);
    if (!result.ok) return { ok: false };
    return {
      ok: true,
      code,
      created: !stored,
    };
  } catch {
    return { ok: false };
  }
}
