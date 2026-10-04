import { describe, expect, it, vi } from "vitest";
import { loadRecoveryKeystore, saveRecoveryKeystore } from "@/app/actions-e2ee";
import { persistRecoveryBackup } from "@/lib/e2ee-backup";
import {
  createEnvelope,
  openEnvelope,
  recoveryIdFor,
  unwrapKeystore,
} from "@/shared/e2ee";

if (!process.env.DATABASE_URL?.includes("nido-tests-"))
  throw new Error("Requiere test:isolated.");
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
