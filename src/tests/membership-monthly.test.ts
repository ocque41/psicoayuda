import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import {
  professionalMemberships,
  professionals,
  stripeEvents,
  user,
} from "@/db/schema";

const stripe = vi.hoisted(() => ({
  customerCreate: vi.fn(),
  subscriptionRetrieve: vi.fn(),
  subscriptionCancel: vi.fn(),
  checkoutRetrieve: vi.fn(),
  checkoutCreate: vi.fn(),
  checkoutExpire: vi.fn(),
}));
vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({
    customers: { create: stripe.customerCreate },
    subscriptions: {
      retrieve: stripe.subscriptionRetrieve,
      cancel: stripe.subscriptionCancel,
    },
    checkout: {
      sessions: {
        retrieve: stripe.checkoutRetrieve,
        create: stripe.checkoutCreate,
        expire: stripe.checkoutExpire,
      },
    },
  }),
}));

import {
  handleMembershipEvent,
  membershipCheckout,
  startMembershipTrial,
} from "@/lib/practice/billing";
import { MEMBERSHIP_PLAN, TRIAL_DAYS } from "@/lib/practice/membership-plan";

const P = "test-membership-monthly";
const pro = { id: P, email: `${P}@example.test` };
const customerId = `cus_${P}`;
const checkoutId = `cs_${P}`;
const checkoutUrl = "https://checkout.stripe.com/c/pay/fictitious";
const stamp = () => new Date().toISOString();
const validCheckout = () => ({
  id: checkoutId,
  status: "open",
  mode: "subscription",
  currency: "usd",
  customer: customerId,
  client_reference_id: `nido-membership:${P}`,
  metadata: {
    nido_membership_pro: P,
    nido_plan: "month",
    nido_membership_policy: String(MEMBERSHIP_PLAN.policyVersion),
  },
  url: checkoutUrl,
  line_items: {
    has_more: false,
    data: [
      {
        quantity: 1,
        price: {
          currency: "usd",
          unit_amount: 1000,
          recurring: { interval: "month", interval_count: 1 },
        },
      },
    ],
  },
});
async function member() {
  return db.query.professionalMemberships.findFirst({
    where: eq(professionalMemberships.professionalId, P),
  });
}
async function patch(
  values: Partial<typeof professionalMemberships.$inferInsert>,
) {
  await db
    .update(professionalMemberships)
    .set(values)
    .where(eq(professionalMemberships.professionalId, P));
}
async function cleanup() {
  await db.delete(stripeEvents).where(eq(stripeEvents.id, `${P}-legacy-event`));
  await db
    .delete(professionalMemberships)
    .where(eq(professionalMemberships.professionalId, P));
  await db.delete(professionals).where(eq(professionals.id, P));
  await db.delete(user).where(eq(user.id, P));
}

describe("plan mensual de 10 USD con consentimiento y recuperación segura", () => {
  beforeAll(async () => {
    await cleanup();
    await db
      .insert(user)
      .values({ id: P, name: "Profesional ficticio", email: pro.email });
    await db.insert(professionals).values({
      id: P,
      userId: P,
      email: pro.email,
      fullName: "Profesional ficticio",
      status: "approved",
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: stamp(),
      updatedAt: stamp(),
    });
  });
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.stubEnv("NIDO_MEMBERSHIP_BILLING_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "fixture-only");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fixture-only");
    await db
      .update(professionals)
      .set({ status: "approved" })
      .where(eq(professionals.id, P));
    await db
      .delete(professionalMemberships)
      .where(eq(professionalMemberships.professionalId, P));
    await db.insert(professionalMemberships).values({
      professionalId: P,
      trialStartedAt: stamp(),
      trialEndsAt: new Date(Date.now() + 10 * 86400000).toISOString(),
      stripeCustomerId: customerId,
      updatedAt: stamp(),
    });
    stripe.checkoutCreate.mockResolvedValue({
      id: checkoutId,
      url: checkoutUrl,
    });
    stripe.checkoutRetrieve.mockResolvedValue(validCheckout());
    stripe.customerCreate.mockResolvedValue({ id: customerId });
  });
  afterEach(() => vi.unstubAllEnvs());
  afterAll(cleanup);

  it("centraliza únicamente 1000 céntimos USD por mes", () => {
    expect(MEMBERSHIP_PLAN).toMatchObject({
      priceCents: 1000,
      currency: "usd",
      interval: "month",
    });
    expect(TRIAL_DAYS).toBe(90);
  });
  it.each([
    "year",
    "week",
    "MONTH",
    "",
    "19",
    "month/year",
  ])("rechaza el intervalo manipulado %s sin contactar al proveedor", async (plan) => {
    await expect(membershipCheckout(pro, plan)).rejects.toThrow(
      "10 USD al mes",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
    expect(stripe.checkoutRetrieve).not.toHaveBeenCalled();
    expect((await member())?.checkoutId).toBeNull();
  });
  it("no abre cobros cuando la bandera está desactivada", async () => {
    vi.stubEnv("NIDO_MEMBERSHIP_BILLING_ENABLED", "false");
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "no están habilitados",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("activa 90 días sin tarjeta ni suscripción y no reinicia una prueba existente", async () => {
    await db
      .delete(professionalMemberships)
      .where(eq(professionalMemberships.professionalId, P));
    await startMembershipTrial(P);
    const first = await member();
    await startMembershipTrial(P);
    expect(await member()).toEqual(first);
    expect(
      Date.parse(first?.trialEndsAt || "") -
        Date.parse(first?.trialStartedAt || ""),
    ).toBe(90 * 86400000);
    expect(first).toMatchObject({
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      checkoutId: null,
    });
    expect(stripe.customerCreate).not.toHaveBeenCalled();
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("crea el checkout de 10 USD y conserva el final real de la prueba", async () => {
    const initial = await member();
    await expect(membershipCheckout(pro, "month")).resolves.toBe(checkoutUrl);
    const [data, options] = stripe.checkoutCreate.mock.calls[0];
    expect(data.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: 1000,
          recurring: { interval: "month" },
          product_data: { name: "Nido · software profesional mensual" },
        },
      },
    ]);
    expect(data.subscription_data.trial_end).toBe(
      Math.floor(Date.parse(initial?.trialEndsAt || "") / 1000),
    );
    expect(options.idempotencyKey).toMatch(/^creating:monthly-usd-10-v1:/);
    expect((await member())?.checkoutId).toBe(checkoutId);
  });
  it("espera al vencimiento en las últimas 48 horas de prueba", async () => {
    await patch({ trialEndsAt: new Date(Date.now() + 86400000).toISOString() });
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "Tu prueba sigue activa",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("no inventa una fecha de prueba cuando el dato no es válido", async () => {
    await patch({ trialEndsAt: "invalid" });
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "fin de tu prueba",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("contrata al finalizar la prueba sin añadir una nueva prueba", async () => {
    await patch({ trialEndsAt: new Date(Date.now() - 86400000).toISOString() });
    await membershipCheckout(pro, "month");
    expect(
      stripe.checkoutCreate.mock.calls[0][0].subscription_data,
    ).not.toHaveProperty("trial_end");
  });
  it("recupera un enlace vigente sólo tras comprobar propietario e importe expandido", async () => {
    await patch({ checkoutId, plan: "month" });
    await expect(membershipCheckout(pro, "month")).resolves.toBe(checkoutUrl);
    expect(stripe.checkoutRetrieve).toHaveBeenCalledWith(checkoutId, {
      expand: ["line_items.data.price"],
    });
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
    expect(stripe.checkoutExpire).not.toHaveBeenCalled();
  });
  it.each([
    [
      "precio antiguo",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data[0].price.unit_amount = 1900;
      },
    ],
    [
      "anual antiguo",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data[0].price.recurring.interval = "year";
        c.line_items.data[0].price.unit_amount = 9900;
      },
    ],
    [
      "otra moneda",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data[0].price.currency = "eur";
      },
    ],
    [
      "moneda incoherente",
      (c: ReturnType<typeof validCheckout>) => {
        c.currency = "eur";
      },
    ],
    [
      "otra cantidad",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data[0].quantity = 2;
      },
    ],
    [
      "cada dos meses",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data[0].price.recurring.interval_count = 2;
      },
    ],
    [
      "lista truncada",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.has_more = true;
      },
    ],
    [
      "dos productos",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data.push(c.line_items.data[0]);
      },
    ],
    [
      "otra política",
      (c: ReturnType<typeof validCheckout>) => {
        c.metadata.nido_membership_policy = "old-price";
      },
    ],
    [
      "sin productos",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data = [];
      },
    ],
  ])("no reutiliza ni modifica un checkout abierto con %s", async (_label, mutate) => {
    await patch({ checkoutId, plan: "month" });
    const current = validCheckout();
    mutate(current);
    stripe.checkoutRetrieve.mockResolvedValue(current);
    const before = await member();
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "no coincide",
    );
    expect(await member()).toEqual(before);
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
    expect(stripe.checkoutExpire).not.toHaveBeenCalled();
  });
  it.each([
    "customer",
    "client_reference_id",
    "mode",
  ] as const)("rechaza un checkout de otro propietario: %s", async (field) => {
    await patch({ checkoutId });
    const current = validCheckout();
    current[field] = "otro";
    stripe.checkoutRetrieve.mockResolvedValue(current);
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "comprobar este pago",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("rechaza metadata de otro profesional incluso con el mismo cliente", async () => {
    await patch({ checkoutId });
    const current = validCheckout();
    current.metadata.nido_membership_pro = "other";
    stripe.checkoutRetrieve.mockResolvedValue(current);
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "comprobar este pago",
    );
  });
  it("un checkout completado pendiente de webhook no permite un segundo pago", async () => {
    await patch({ checkoutId });
    stripe.checkoutRetrieve.mockResolvedValue({
      ...validCheckout(),
      status: "complete",
    });
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "Ya completaste un pago",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("un checkout expirado propio permite una operación nueva al precio vigente", async () => {
    await patch({ checkoutId });
    stripe.checkoutRetrieve.mockResolvedValue({
      ...validCheckout(),
      status: "expired",
    });
    await expect(membershipCheckout(pro, "month")).resolves.toBe(checkoutUrl);
    expect(stripe.checkoutCreate).toHaveBeenCalledOnce();
    expect(stripe.checkoutExpire).not.toHaveBeenCalled();
  });
  it("no recupera una preparación antigua con los parámetros del precio nuevo", async () => {
    await patch({ checkoutId: "creating:old-key", plan: "month" });
    const before = await member();
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "pago anterior en preparación",
    );
    expect(await member()).toEqual(before);
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("un fallo del proveedor conserva y recupera la misma clave versionada", async () => {
    stripe.checkoutCreate.mockRejectedValueOnce(
      new Error("proveedor temporalmente no disponible"),
    );
    await expect(membershipCheckout(pro, "month")).rejects.toThrow("proveedor");
    const key = (await member())?.checkoutId;
    await expect(membershipCheckout(pro, "month")).resolves.toBe(checkoutUrl);
    expect(
      stripe.checkoutCreate.mock.calls.map((call) => call[1].idempotencyKey),
    ).toEqual([key, key]);
  });
  it("no repite una preparación que excede la retención segura de idempotencia", async () => {
    await patch({
      checkoutId: `creating:${MEMBERSHIP_PLAN.policyVersion}:${Date.now() - 24 * 3600000}:fixture`,
      plan: "month",
    });
    const before = await member();
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "pendiente de comprobación",
    );
    expect(await member()).toEqual(before);
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("dos peticiones concurrentes sólo usan una clave para crear la suscripción", async () => {
    const results = await Promise.allSettled([
      membershipCheckout(pro, "month"),
      membershipCheckout(pro, "month"),
    ]);
    expect(
      results.some((r) => r.status === "fulfilled" && r.value === checkoutUrl),
    ).toBe(true);
    const keys = stripe.checkoutCreate.mock.calls.map(
      (call) => call[1].idempotencyKey,
    );
    expect(new Set(keys).size).toBe(1);
    expect((await member())?.checkoutId).toBe(checkoutId);
  });
  it("no crea ni recupera un pago para un profesional que dejó de estar aprobado", async () => {
    await patch({ checkoutId });
    await db
      .update(professionals)
      .set({ status: "pending" })
      .where(eq(professionals.id, P));
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "necesita aprobación",
    );
    expect(stripe.checkoutRetrieve).not.toHaveBeenCalled();
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("detecta una suspensión durante la comprobación del checkout", async () => {
    await patch({ checkoutId });
    stripe.checkoutRetrieve.mockImplementation(async () => {
      await db
        .update(professionals)
        .set({ status: "pending" })
        .where(eq(professionals.id, P));
      return validCheckout();
    });
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "estado del plan cambió",
    );
  });
  it("una suscripción anual histórica activa se gestiona sin repricing ni cancelación", async () => {
    await patch({
      stripeSubscriptionId: "sub_historical",
      plan: "year",
      status: "active",
    });
    stripe.subscriptionRetrieve.mockResolvedValue({
      id: "sub_historical",
      status: "active",
    });
    const before = await member();
    await expect(membershipCheckout(pro, "month")).rejects.toThrow(
      "Ya tienes una suscripción",
    );
    expect(await member()).toEqual(before);
    expect(stripe.subscriptionCancel).not.toHaveBeenCalled();
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("los webhooks siguen conservando el plan histórico sin imponerle el nuevo precio", async () => {
    stripe.subscriptionRetrieve.mockResolvedValue({
      id: "sub_historical",
      customer: customerId,
      status: "active",
      metadata: { nido_membership_pro: P, nido_plan: "year" },
    });
    await handleMembershipEvent({
      id: `${P}-legacy-event`,
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_historical", metadata: { nido_membership_pro: P } },
      },
    } as unknown as Parameters<typeof handleMembershipEvent>[0]);
    expect(await member()).toMatchObject({
      stripeSubscriptionId: "sub_historical",
      plan: "year",
      status: "active",
    });
    expect(stripe.subscriptionCancel).not.toHaveBeenCalled();
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
});
