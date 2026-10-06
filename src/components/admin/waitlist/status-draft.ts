import type { GeneralWaitlistDetail } from "@/lib/admin-waitlist/types";

export type WaitlistStatusDraft = {
  selected: string;
  expected: { status: string; updatedAt: string };
};
type RemoteStatus = Pick<GeneralWaitlistDetail, "status" | "updatedAt">;

export function statusDraftFromRemote(
  remote: RemoteStatus,
): WaitlistStatusDraft {
  return {
    selected: remote.status,
    expected: { status: remote.status, updatedAt: remote.updatedAt },
  };
}

/** Una respuesta de otra ventana no cambia la propuesta ni su comparación CAS. */
export function receiveWaitlistStatus(
  draft: WaitlistStatusDraft,
  remote: RemoteStatus,
) {
  return draft.selected !== draft.expected.status
    ? draft
    : statusDraftFromRemote(remote);
}

/** Sólo se usa después de confirmar el descarte y volver a leer el registro. */
export function recoverWaitlistStatus(
  remote: RemoteStatus,
): WaitlistStatusDraft {
  return statusDraftFromRemote(remote);
}
