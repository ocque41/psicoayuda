import { and, eq, like } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { professionalMemberships, professionals, user } from "@/db/schema";
import {
  listPlanProfessionals,
  migrateToSubscription,
  revertToLegacy,
} from "@/lib/practice/plan-migration";
import {
  accessLockedFor,
  professionalAccessLocked,
  professionalAccessOpenSql,
} from "@/lib/practice/subscription-access";

const P = "test-subscription-access";
const stamp = () => new Date().toISOString();

function billingOn() {
  vi.stubEnv("NIDO_MEMBERSHIP_BILLING_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "fixture-only");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fixture-only");
}
async function cleanup() {
  await db
    .delete(professionalMemberships)
    .where(like(professionalMemberships.professionalId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function pro(
  suffix: string,
  values: Partial<typeof professionals.$inferInsert> = {},
) {
  const id = `${P}-${suffix}`;
  await db
    .insert(user)
    .values({ id, name: "Profesional ficticio", email: `${id}@example.test` });
  await db.insert(professionals).values({
    id,
    userId: id,
    email: `${id}@example.test`,
    fullName: `Profesional ${suffix}`,
    status: "approved",
    acceptingRequests: true,
    remoteAvailable: true,
    languages: '["es"]',
    supportAreas: "[]",
    createdAt: stamp(),
    updatedAt: stamp(),
    ...values,
  });
  return id;
}
async function membership(id: string, status: string) {
  await db.insert(professionalMemberships).values({
    professionalId: id,
    trialStartedAt: stamp(),
    trialEndsAt: stamp(),
    status,
    updatedAt: stamp(),
  });
}

describe("acceso al software según el plan", () => {
  beforeEach(cleanup);
  afterEach(() => vi.unstubAllEnvs());
  afterAll(cleanup);

  it("con los cobros apagados nadie pierde el acceso", async () => {
    vi.stubEnv("NIDO_MEMBERSHIP_BILLING_ENABLED", "false");
    const id = await pro("off", { accessPlan: "subscription" });
    expect(accessLockedFor("subscription", null)).toBe(false);
    expect(await professionalAccessLocked(id)).toBe(false);
    expect(professionalAccessOpenSql()).toBeUndefined();
  });
  it.each([
    ["legacy", null, false],
    ["legacy", "canceled", false],
    ["subscription", null, true],
    ["subscription", "none", true],
    ["subscription", "canceled", true],
    ["subscription", "unpaid", true],
    ["subscription", "incomplete", true],
    ["subscription", "active", false],
    ["subscription", "trialing", false],
    ["subscription", "past_due", false],
  ])("con cobros activos: plan %s y suscripción %s → bloqueado=%s", (plan, status, locked) => {
    billingOn();
    expect(accessLockedFor(plan, status)).toBe(locked);
  });
  it("bloquea en la base de datos solo a quien está en suscripción sin plan vigente", async () => {
    billingOn();
    const legacy = await pro("legacy");
    const unpaid = await pro("unpaid", { accessPlan: "subscription" });
    const paid = await pro("paid", { accessPlan: "subscription" });
    await membership(paid, "active");
    expect(await professionalAccessLocked(legacy)).toBe(false);
    expect(await professionalAccessLocked(unpaid)).toBe(true);
    expect(await professionalAccessLocked(paid)).toBe(false);
    // La misma regla excluye de nuevas asignaciones a quien está en pausa.
    const open = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(like(professionals.id, `${P}%`), professionalAccessOpenSql()));
    expect(open.map((row) => row.id).sort()).toEqual([legacy, paid].sort());
  });
});

describe("paso de perfiles anteriores a suscripción", () => {
  beforeEach(cleanup);
  afterEach(() => vi.unstubAllEnvs());
  afterAll(cleanup);

  it("no se ejecuta con los cobros apagados y no cambia ningún perfil", async () => {
    vi.stubEnv("NIDO_MEMBERSHIP_BILLING_ENABLED", "false");
    const id = await pro("waiting");
    await expect(migrateToSubscription("all")).rejects.toThrow(
      "Activa primero los cobros",
    );
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, id),
      }),
    ).toMatchObject({ accessPlan: "legacy", accessPlanChangedAt: null });
  });
  it("pasa solo a clínicos aprobados en el plan anterior y conserva el resto", async () => {
    billingOn();
    vi.stubEnv("RESEND_API_KEY", "");
    const legacy = await pro("move");
    const helper = await pro("helper", { nonClinicalHelper: true });
    const pending = await pro("pending", { status: "pending_verification" });
    const already = await pro("already", { accessPlan: "subscription" });
    const result = await migrateToSubscription("all");
    expect(result).toEqual({ moved: 1, emailed: 0 });
    const plans = Object.fromEntries(
      (
        await db
          .select({ id: professionals.id, plan: professionals.accessPlan })
          .from(professionals)
          .where(like(professionals.id, `${P}%`))
      ).map((row) => [row.id, row.plan]),
    );
    expect(plans).toEqual({
      [legacy]: "subscription",
      [helper]: "legacy",
      [pending]: "legacy",
      [already]: "subscription",
    });
    expect(await professionalAccessLocked(legacy)).toBe(true);
    expect(
      (await listPlanProfessionals()).filter((row) => row.id.startsWith(P)),
    ).toHaveLength(2);
  });
  it("devolver al plan anterior restaura el acceso sin tocar otros datos", async () => {
    billingOn();
    const id = await pro("revert", {
      accessPlan: "subscription",
      maxActiveRequests: 7,
    });
    expect(await professionalAccessLocked(id)).toBe(true);
    expect(await revertToLegacy(id)).toBe(true);
    expect(await professionalAccessLocked(id)).toBe(false);
    expect(
      await db.query.professionals.findFirst({
        where: eq(professionals.id, id),
      }),
    ).toMatchObject({ accessPlan: "legacy", maxActiveRequests: 7 });
  });
});
