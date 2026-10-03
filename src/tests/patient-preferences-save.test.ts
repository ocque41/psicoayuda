import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { savePatientPreferences } from "@/app/mi/actions";
import { db } from "@/db";
import { patientAccounts, user } from "@/db/schema";
import { completePatientOnboarding } from "@/lib/patient/accounts";

const mocks = vi.hoisted(() => ({ require: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: {} } }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/patient/access", async () => ({
  ...(await vi.importActual<typeof import("@/lib/patient/access")>(
    "@/lib/patient/access",
  )),
  requirePatientAccount: mocks.require,
}));

const P = "test-preferences-save";
const owner = `${P}-owner`;
const other = `${P}-other`;
async function cleanup() {
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function snapshot() {
  const account = await db.query.patientAccounts.findFirst({
    where: eq(patientAccounts.userId, owner),
  });
  if (!account) throw new Error("Falta la cuenta ficticia de prueba.");
  return { account, user: { id: owner, name: "Cuenta ficticia" } };
}
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    displayName: "Alias actualizado",
    country: "ES",
    timezone: "Europe/Madrid",
    preferredLanguage: "es",
    ageBand: "adult",
  }))
    data.set(key, value);
  return data;
}
async function expectRejected() {
  const result = await savePatientPreferences(
    { ok: false, message: "" },
    form(),
  );
  expect(result?.ok).toBe(false);
  expect(result?.message).toContain("No pudimos guardar");
  expect(mocks.revalidate).not.toHaveBeenCalled();
  const account = await db.query.patientAccounts.findFirst({
    where: eq(patientAccounts.userId, owner),
  });
  if (account) expect(account.displayName).toBe("Alias original");
}

describe("guardado atómico de preferencias del paciente", () => {
  beforeEach(async () => {
    await cleanup();
    mocks.require.mockReset();
    mocks.revalidate.mockClear();
    await db.insert(user).values(
      [owner, other].map((id) => ({
        id,
        email: `${id}@example.test`,
        name: "Cuenta ficticia",
      })),
    );
    await completePatientOnboarding(owner, {
      displayName: "Alias original",
      country: "VE",
      timezone: "UTC",
      ageBand: "adult",
    });
    mocks.require.mockImplementation(snapshot);
  });
  afterAll(cleanup);

  it("guarda la cuenta activa propietaria y confirma el UPDATE real", async () => {
    const result = await savePatientPreferences(
      { ok: false, message: "" },
      form(),
    );
    expect(result?.ok).toBe(true);
    expect(mocks.revalidate).toHaveBeenCalledWith("/mi", "layout");
    expect(
      await db.query.patientAccounts.findFirst({
        where: eq(patientAccounts.userId, owner),
      }),
    ).toMatchObject({
      displayName: "Alias actualizado",
      country: "ES",
      timezone: "Europe/Madrid",
      deletionState: "active",
    });
  });

  it("rechaza una baja iniciada después de leer la cuenta", async () => {
    const previous = await snapshot();
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, owner));
    mocks.require.mockResolvedValue(previous);
    await expectRejected();
  });

  it("no anuncia éxito cuando la fila desaparece antes de escribir", async () => {
    const previous = await snapshot();
    await db.delete(patientAccounts).where(eq(patientAccounts.userId, owner));
    mocks.require.mockResolvedValue(previous);
    await expectRejected();
  });

  it("rechaza un usuario eliminado aunque llegue una lectura anterior", async () => {
    const previous = await snapshot();
    await db.delete(user).where(eq(user.id, owner));
    mocks.require.mockResolvedValue(previous);
    await expectRejected();
  });

  it("no escribe con un actor distinto al propietario de la lectura", async () => {
    const previous = await snapshot();
    mocks.require.mockResolvedValue({
      ...previous,
      user: { id: other, name: "Otra cuenta ficticia" },
    });
    await expectRejected();
  });

  it("rechaza si el onboarding deja de estar completo antes de escribir", async () => {
    const previous = await snapshot();
    await db
      .update(patientAccounts)
      .set({ onboardingCompletedAt: null })
      .where(eq(patientAccounts.userId, owner));
    mocks.require.mockResolvedValue(previous);
    await expectRejected();
  });
});
