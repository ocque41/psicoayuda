import type {} from "./types";

// Transporte ficticio exclusivo del navegador de prueba; ningún proveedor/BD real.
function fixture() {
  return window.fixture;
}
export async function verifyProfessionalE2eeActor(id: string) {
  const f = fixture();
  if (f.holdAuth) {
    f.holdAuth = false;
    return new Promise<{ ok: boolean; expiresAt: number }>((resolve) => {
      f.releaseAuth = () => resolve({ ok: true, expiresAt: f.expiresAt });
      f.authPending = true;
    });
  }
  return {
    ok: id === f.actor && Date.now() < f.expiresAt,
    expiresAt: f.expiresAt,
  };
}
export async function publishProIdentityKey(
  _key: string,
  _expected?: string | null,
  id?: string,
) {
  return { ok: !id || id === fixture().actor };
}
export async function saveRecoveryKeystore(id: string, wrapped: string) {
  const f = fixture();
  if (f.holdSave)
    await new Promise<void>((resolve) => {
      f.releaseSave = resolve;
      f.savePending = true;
    });
  f.backups.set(id, wrapped);
  return { ok: true };
}
export async function loadRecoveryKeystore(id: string) {
  const f = fixture();
  if (f.holdLoad)
    await new Promise<void>((resolve) => {
      f.releaseLoad = resolve;
      f.loadPending = true;
    });
  const wrapped = f.backups.get(id);
  return wrapped ? { wrapped } : null;
}
