import { describe, expect, it, vi } from "vitest";
import { loadRecoveryKeystore, saveRecoveryKeystore } from "@/app/actions-e2ee";
import { persistRecoveryBackup } from "@/lib/e2ee-backup";
import { createE2eeSessionGuard } from "@/lib/e2ee-session-guard";
import {
  createEnvelope,
  openEnvelope,
  recoveryIdFor,
  unwrapKeystore,
  wrapKeystore,
} from "@/shared/e2ee";

if (!process.env.DATABASE_URL?.includes("nido-tests-"))
  throw new Error("Requiere test:isolated.");

it("revocación durante descifrado no importa ni borra claves/códigos del dispositivo", async () => {
  const client = await import("@/lib/e2ee-client");
  const scope = client.professionalSlot("fixture-invalidation");
  await client.getOrCreateIdentity(scope);
  const backup = await client.createRecoveryBackup(scope);
  if (!backup) throw new Error("Sin respaldo ficticio");
  const before = await client.exportKeystoreJson();
  const beforeCode = await client.getStoredRecoveryCode(scope);
  const guard = createE2eeSessionGuard(
    async () => ({ ok: true }),
    () => {},
  );
  const ticket = guard.ticket();
  const pending = client.restoreFromBackup(
    backup.code,
    backup.wrapped,
    scope,
    () => guard.current(ticket),
  );
  guard.invalidate();
  expect(await pending).toEqual({ ok: false, restored: 0 });
  expect(await client.exportKeystoreJson()).toBe(before);
  expect(await client.getStoredRecoveryCode(scope)).toBe(beforeCode);
  guard.dispose();
});

it("rechaza un respaldo moderno de otra cuenta sin alterar claves ni códigos", async () => {
  const client = await import("@/lib/e2ee-client");
  const slotA = client.professionalSlot("fixture-wrong-scope-a");
  const slotB = client.professionalSlot("fixture-wrong-scope-b");
  await client.getOrCreateIdentity(slotA);
  await client.getOrCreateIdentity(slotB);
  const backupA = await client.createRecoveryBackup(slotA);
  const backupB = await client.createRecoveryBackup(slotB);
  if (!backupA || !backupB) throw new Error("Sin respaldo ficticio");
  await client.replaceIdentity(slotA);
  const before = await client.exportKeystoreJson();
  expect(
    await client.restoreFromBackup(backupA.code, backupA.wrapped, slotB),
  ).toEqual({ ok: false, restored: 0 });
  expect(await client.exportKeystoreJson()).toBe(before);
  expect(await client.getStoredRecoveryCode(slotA)).toBe(backupA.code);
  expect(await client.getStoredRecoveryCode(slotB)).toBe(backupB.code);
});

it("rechaza entradas ajenas dentro de un respaldo moderno antes de importar", async () => {
  const client = await import("@/lib/e2ee-client");
  const slotA = client.professionalSlot("fixture-mixed-scope-a");
  const slotB = client.professionalSlot("fixture-mixed-scope-b");
  const a = await client.getOrCreateIdentity(slotA);
  const b = await client.getOrCreateIdentity(slotB);
  const backup = await client.createRecoveryBackup(slotA);
  if (!backup) throw new Error("Sin respaldo ficticio");
  const wrapped = await wrapKeystore(
    JSON.stringify({ v: 1, scope: slotA, entries: [a.entry, b.entry] }),
    backup.code,
  );
  await client.replaceIdentity(slotA);
  await client.replaceIdentity(slotB);
  const before = await client.exportKeystoreJson();
  expect(await client.restoreFromBackup(backup.code, wrapped, slotA)).toEqual({
    ok: false,
    restored: 0,
  });
  expect(await client.exportKeystoreJson()).toBe(before);
  expect(await client.getStoredRecoveryCode(slotA)).toBe(backup.code);
  expect(await client.getStoredRecoveryCode(slotB)).toBeNull();
});

it("la etiqueta ownerSlot no autoriza importar la identidad de otro profesional", async () => {
  const client = await import("@/lib/e2ee-client");
  const slotA = client.professionalSlot("fixture-spoof-owner-a");
  const slotB = client.professionalSlot("fixture-spoof-owner-b");
  const a = await client.getOrCreateIdentity(slotA);
  const b = await client.getOrCreateIdentity(slotB);
  const backup = await client.createRecoveryBackup(slotA);
  if (!backup) throw new Error("Sin respaldo ficticio");
  const wrapped = await wrapKeystore(
    JSON.stringify({
      v: 1,
      scope: slotA,
      entries: [a.entry, { ...b.entry, ownerSlot: slotA }],
    }),
    backup.code,
  );
  await client.replaceIdentity(slotB);
  const before = await client.exportKeystoreJson();
  expect(await client.restoreFromBackup(backup.code, wrapped, slotA)).toEqual({
    ok: false,
    restored: 0,
  });
  expect(await client.exportKeystoreJson()).toBe(before);
});

it.each([
  false,
  true,
])("un respaldo profesional no sustituye una clave seeker ajena (con dueño: %s)", async (owned) => {
  const client = await import("@/lib/e2ee-client");
  const slotA = client.professionalSlot(`fixture-owned-seeker-a-${owned}`);
  const slotB = client.professionalSlot(`fixture-owned-seeker-b-${owned}`);
  const slot = client.seekerSlot(`fixture-owned-room-${owned}`);
  const a = await client.getOrCreateIdentity(slotA);
  const seeker = await client.getOrCreateIdentity(slot);
  const backup = await client.createRecoveryBackup(slotA);
  if (!backup) throw new Error("Sin respaldo ficticio");
  const wrapped = await wrapKeystore(
    JSON.stringify({
      v: 1,
      scope: slotA,
      entries: [a.entry, { ...seeker.entry, ownerSlot: slotA }],
    }),
    backup.code,
  );
  await client.replaceIdentity(slot);
  if (owned) await client.registerIdentityOwner(slot, slotB);
  const before = await client.exportKeystoreJson();
  expect(await client.restoreFromBackup(backup.code, wrapped, slotA)).toEqual({
    ok: false,
    restored: 0,
  });
  expect(await client.exportKeystoreJson()).toBe(before);
});
describe("recuperación E2EE entre dispositivos", () => {
  it("restaura la misma identidad y lee un sobre anterior con el respaldo confirmado", async () => {
    const first = await import("@/lib/e2ee-client");
    const { identity } = await first.getOrCreateIdentity(
      first.professionalSlot("fictional-pro"),
    );
    const content = await createEnvelope({
      identity,
      peerPublicKey: identity.publicKey,
      conversationId: "fictional-conversation",
      senderRole: "professional",
      plaintext: "Mensaje ficticio anterior",
    });
    const backup = await persistRecoveryBackup(
      "professional",
      saveRecoveryKeystore,
    );
    expect(backup.ok).toBe(true);
    if (!backup.ok) throw new Error("Sin respaldo");
    const id = await recoveryIdFor(backup.code);
    if (!id) throw new Error("Código inválido");
    const stored = await loadRecoveryKeystore(id);
    if (!stored) throw new Error("Sin copia remota");
    vi.resetModules();
    const second = await import("@/lib/e2ee-client");
    expect(
      await second.loadIdentity(second.professionalSlot("fictional-pro")),
    ).toBeNull();
    expect(
      (await second.restoreFromBackup(backup.code, stored.wrapped)).ok,
    ).toBe(true);
    const restored = await second.loadProfessionalIdentity(
      "fictional-pro",
      identity.publicKey,
    );
    if (!restored) throw new Error("Sin identidad");
    expect(restored.publicKey).toBe(identity.publicKey);
    expect(
      await openEnvelope({
        identity: restored,
        conversationId: "fictional-conversation",
        senderRole: "professional",
        content,
      }),
    ).toBe("Mensaje ficticio anterior");
    expect(
      (await second.restoreFromBackup("BAD-CODE", stored.wrapped)).ok,
    ).toBe(false);
  });
  it("adopta el slot legado sólo si coincide con la cuenta, sin rotarlo ni apropiarlo para otra", async () => {
    const client = await import("@/lib/e2ee-client");
    const legacy = await client.getOrCreateIdentity(client.PRO_SLOT);
    expect(
      await client.loadProfessionalIdentity("fictional-other", null),
    ).toBeNull();
    const adopted = await client.loadProfessionalIdentity(
      "fictional-legacy-owner",
      legacy.identity.publicKey,
    );
    expect(adopted?.publicKey).toBe(legacy.identity.publicKey);
    expect((await client.loadIdentity(client.PRO_SLOT))?.publicKey).toBe(
      legacy.identity.publicKey,
    );
    expect(client.professionalSlot("fictional-other")).not.toBe(
      client.professionalSlot("fictional-legacy-owner"),
    );
  });
});

it("no comparte códigos ni claves entre cuentas; conserva respaldos legados", async () => {
  const client = await import("@/lib/e2ee-client");
  const slotA = client.professionalSlot("fixture-scope-a");
  const slotB = client.professionalSlot("fixture-scope-b");
  await client.getOrCreateIdentity(slotA);
  await client.getOrCreateIdentity(slotB);
  const legacy = await client.createRecoveryBackup();
  if (!legacy) throw new Error("Sin respaldo legado");
  await saveRecoveryKeystore(legacy.id, legacy.wrapped, "professional");
  const a = await client.createRecoveryBackup(slotA);
  const b = await client.createRecoveryBackup(slotB);
  if (!a || !b) throw new Error("Sin respaldo aislado");
  expect(a.code).not.toBe(b.code);
  expect(a.code).not.toBe(legacy.code);
  const json = await unwrapKeystore(b.wrapped, b.code);
  if (!json) throw new Error("Sin contenido");
  expect(
    JSON.parse(json).entries.map((entry: { slot: string }) => entry.slot),
  ).toEqual([slotB]);
  expect(await client.getStoredRecoveryCode(slotA)).toBe(a.code);
  expect(await client.getStoredRecoveryCode(slotB)).toBe(b.code);
  await client.restoreFromBackup(
    legacy.code,
    legacy.wrapped,
    client.professionalSlot("fixture-legacy-scoped"),
  );
  expect(
    await client.getStoredRecoveryCode(
      client.professionalSlot("fixture-legacy-scoped"),
    ),
  ).toBeNull();
  expect((await loadRecoveryKeystore(legacy.id))?.wrapped).toBe(legacy.wrapped);
});
