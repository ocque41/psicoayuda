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
} from "@/lib/practice/billing";
import {
  existingProfessionalTrialEnd,
  formatMembershipPrice,
  MEMBERSHIP_POLICY_VERSION,
  MEMBERSHIP_PRICES,
  stripeTrialEnd,
  suggestedMembershipCurrency,
  trialActive,
  trialDaysLeft,
  yearlySavingsPercent,
} from "@/lib/practice/membership-plan";

const P = "test-membership-plans";
const pro = { id: P, email: `${P}@example.test` };
const customerId = `cus_${P}`;
const checkoutId = `cs_${P}`;
const checkoutUrl = "https://checkout.stripe.com/c/pay/fictitious";
const stamp = () => new Date().toISOString();
const validCheckout = () => ({
  id: checkoutId,
  status: "open",
  mode: "subscription",
  currency: "eur",
  customer: customerId,
  client_reference_id: `nido-membership:${P}`,
  metadata: {
    nido_membership_pro: P,
    nido_plan: "year",
    nido_currency: "eur",
    nido_membership_policy: String(MEMBERSHIP_POLICY_VERSION),
  },
  url: checkoutUrl,
  line_items: {
    has_more: false,
    data: [
      {
        quantity: 1,
        price: {
          currency: "eur",
          unit_amount: 9999,
          recurring: { interval: "year", interval_count: 1 },
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

describe("planes mensual y anual en $, € y £ con consentimiento y recuperación segura", () => {
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
      trialEndsAt: stamp(),
      status: "none",
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

  it("centraliza 14,99 al mes y 99,99 al año en las tres monedas", () => {
    for (const currency of ["usd", "eur", "gbp"] as const) {
      expect(MEMBERSHIP_PRICES.month[currency]).toBe(1499);
      expect(MEMBERSHIP_PRICES.year[currency]).toBe(9999);
      expect(yearlySavingsPercent(currency)).toBe(44);
    }
    expect(formatMembershipPrice("month", "eur")).toBe("14,99\u00a0€");
    expect(formatMembershipPrice("year", "gbp")).toBe("99,99\u00a0£");
  });
  it("calcula la prueba de 90 días y el límite de 48 h de Stripe", () => {
    const now = Date.parse("2026-11-19T12:00:00.000Z");
    const end = existingProfessionalTrialEnd(now);
    expect(end).toBe("2027-02-17T12:00:00.000Z");
    expect(trialActive(end, now)).toBe(true);
    expect(trialDaysLeft(end, now)).toBe(90);
    expect(trialActive(end, Date.parse(end))).toBe(false);
    expect(stripeTrialEnd(end, now)).toBe(Math.floor(Date.parse(end) / 1000));
    const almost = new Date(now + 49 * 3_600_000).toISOString();
    expect(stripeTrialEnd(almost, now)).toBeNull();
    expect(stripeTrialEnd(null, now)).toBeNull();
  });
  it("durante la prueba, el checkout empieza a cobrar al terminarla", async () => {
    const trialEndsAt = new Date(Date.now() + 60 * 86_400_000).toISOString();
    await db
      .update(professionals)
      .set({ accessPlan: "subscription", accessTrialEndsAt: trialEndsAt })
      .where(eq(professionals.id, P));
    try {
      await expect(membershipCheckout(pro, "year", "eur")).resolves.toBe(
        checkoutUrl,
      );
      const [data] = stripe.checkoutCreate.mock.calls[0];
      const expected = Math.floor(Date.parse(trialEndsAt) / 1000);
      expect(data.subscription_data.trial_end).toBe(expected);
      expect(data.metadata.nido_trial_end).toBe(String(expected));
      expect(data.line_items[0].price_data.unit_amount).toBe(9999);
    } finally {
      await db
        .update(professionals)
        .set({ accessPlan: "legacy", accessTrialEndsAt: null })
        .where(eq(professionals.id, P));
    }
  });
  it("sin prueba vigente, el checkout no lleva trial_end", async () => {
    await membershipCheckout(pro, "month", "usd");
    const [data] = stripe.checkoutCreate.mock.calls[0];
    expect(data.subscription_data.trial_end).toBeUndefined();
    expect(data.metadata.nido_trial_end).toBeUndefined();
  });
  it("sugiere la moneda por país sin impedir elegir otra", () => {
    expect(suggestedMembershipCurrency("España")).toBe("eur");
    expect(suggestedMembershipCurrency("Reino Unido")).toBe("gbp");
    expect(suggestedMembershipCurrency("Venezuela")).toBe("usd");
    expect(suggestedMembershipCurrency(null)).toBe("usd");
  });
  it.each([
    ["week", "eur"],
    ["MONTH", "eur"],
    ["", "eur"],
    ["month", "jpy"],
    ["year", "EUR"],
    ["year", ""],
  ])("rechaza %s/%s sin contactar al proveedor", async (plan, currency) => {
    await expect(membershipCheckout(pro, plan, currency)).rejects.toThrow(
      "moneda disponible",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
    expect(stripe.checkoutRetrieve).not.toHaveBeenCalled();
    expect((await member())?.checkoutId).toBeNull();
  });
  it("no abre cobros cuando la bandera está desactivada", async () => {
    vi.stubEnv("NIDO_MEMBERSHIP_BILLING_ENABLED", "false");
    await expect(membershipCheckout(pro, "month", "usd")).rejects.toThrow(
      "todavía no está abierta",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("crea la fila local sin prueba ni acceso si no existía", async () => {
    await db
      .delete(professionalMemberships)
      .where(eq(professionalMemberships.professionalId, P));
    await expect(membershipCheckout(pro, "month", "usd")).resolves.toBe(
      checkoutUrl,
    );
    expect(await member()).toMatchObject({
      status: "none",
      plan: "month",
      currency: "usd",
      checkoutId,
    });
    expect(stripe.customerCreate).toHaveBeenCalledOnce();
  });
  it.each([
    ["month", "usd", 1499, "mensual"],
    ["year", "eur", 9999, "anual"],
    ["year", "gbp", 9999, "anual"],
  ] as const)("crea el checkout %s en %s por %i céntimos sin prueba", async (plan, currency, amount, label) => {
    await expect(membershipCheckout(pro, plan, currency)).resolves.toBe(
      checkoutUrl,
    );
    const [data, options] = stripe.checkoutCreate.mock.calls[0];
    expect(data.line_items).toEqual([
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: amount,
          recurring: { interval: plan },
          product_data: { name: `Nido · software profesional (${label})` },
        },
      },
    ]);
    expect(data.subscription_data).not.toHaveProperty("trial_end");
    expect(data.metadata).toMatchObject({
      nido_plan: plan,
      nido_currency: currency,
      nido_membership_policy: MEMBERSHIP_POLICY_VERSION,
    });
    expect(options.idempotencyKey).toMatch(
      new RegExp(`^creating:${MEMBERSHIP_POLICY_VERSION}:`),
    );
    expect(await member()).toMatchObject({ checkoutId, plan, currency });
  });
  it("recupera un enlace vigente sólo tras comprobar propietario e importe expandido", async () => {
    await patch({ checkoutId, plan: "year", currency: "eur" });
    await expect(membershipCheckout(pro, "year", "eur")).resolves.toBe(
      checkoutUrl,
    );
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
        c.line_items.data[0].price.unit_amount = 1000;
      },
    ],
    [
      "otra moneda",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data[0].price.currency = "usd";
      },
    ],
    [
      "otra cantidad",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.data[0].quantity = 2;
      },
    ],
    [
      "lista truncada",
      (c: ReturnType<typeof validCheckout>) => {
        c.line_items.has_more = true;
      },
    ],
    [
      "otra política",
      (c: ReturnType<typeof validCheckout>) => {
        c.metadata.nido_membership_policy = "monthly-usd-10-v1";
      },
    ],
  ])("cierra un checkout propio abierto con %s y abre uno vigente", async (_label, mutate) => {
    await patch({ checkoutId, plan: "year", currency: "eur" });
    const current = validCheckout();
    mutate(current);
    stripe.checkoutRetrieve.mockResolvedValue(current);
    await expect(membershipCheckout(pro, "year", "eur")).resolves.toBe(
      checkoutUrl,
    );
    expect(stripe.checkoutExpire).toHaveBeenCalledWith(checkoutId);
    expect(stripe.checkoutCreate).toHaveBeenCalledOnce();
  });
  it("cambiar de plan o moneda cierra el enlace anterior antes de abrir otro", async () => {
    await patch({ checkoutId, plan: "year", currency: "eur" });
    await expect(membershipCheckout(pro, "month", "gbp")).resolves.toBe(
      checkoutUrl,
    );
    expect(stripe.checkoutExpire).toHaveBeenCalledWith(checkoutId);
    expect(
      stripe.checkoutCreate.mock.calls[0][0].line_items[0].price_data,
    ).toMatchObject({ currency: "gbp", unit_amount: 1499 });
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
    await expect(membershipCheckout(pro, "year", "eur")).rejects.toThrow(
      "comprobar este pago",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
    expect(stripe.checkoutExpire).not.toHaveBeenCalled();
  });
  it("un checkout completado pendiente de webhook no permite un segundo pago", async () => {
    await patch({ checkoutId });
    stripe.checkoutRetrieve.mockResolvedValue({
      ...validCheckout(),
      status: "complete",
    });
    await expect(membershipCheckout(pro, "year", "eur")).rejects.toThrow(
      "Ya completaste un pago",
    );
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("un checkout expirado propio permite una operación nueva", async () => {
    await patch({ checkoutId });
    stripe.checkoutRetrieve.mockResolvedValue({
      ...validCheckout(),
      status: "expired",
    });
    await expect(membershipCheckout(pro, "year", "eur")).resolves.toBe(
      checkoutUrl,
    );
    expect(stripe.checkoutCreate).toHaveBeenCalledOnce();
    expect(stripe.checkoutExpire).not.toHaveBeenCalled();
  });
  it("no recupera una preparación con otras condiciones", async () => {
    await patch({
      checkoutId: `creating:${MEMBERSHIP_POLICY_VERSION}:${Date.now()}:fixture`,
      plan: "month",
      currency: "usd",
    });
    const before = await member();
    await expect(membershipCheckout(pro, "year", "eur")).rejects.toThrow(
      "otras condiciones",
    );
    expect(await member()).toEqual(before);
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("un fallo del proveedor conserva y recupera la misma clave versionada", async () => {
    stripe.checkoutCreate.mockRejectedValueOnce(
      new Error("proveedor temporalmente no disponible"),
    );
    await expect(membershipCheckout(pro, "month", "usd")).rejects.toThrow(
      "proveedor",
    );
    const key = (await member())?.checkoutId;
    await expect(membershipCheckout(pro, "month", "usd")).resolves.toBe(
      checkoutUrl,
    );
    expect(
      stripe.checkoutCreate.mock.calls.map((call) => call[1].idempotencyKey),
    ).toEqual([key, key]);
  });
  it("no repite una preparación que excede la retención segura de idempotencia", async () => {
    await patch({
      checkoutId: `creating:${MEMBERSHIP_POLICY_VERSION}:${Date.now() - 24 * 3600000}:fixture`,
      plan: "month",
      currency: "usd",
    });
    const before = await member();
    await expect(membershipCheckout(pro, "month", "usd")).rejects.toThrow(
      "pendiente de comprobación",
    );
    expect(await member()).toEqual(before);
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("dos peticiones concurrentes sólo usan una clave para crear la suscripción", async () => {
    const results = await Promise.allSettled([
      membershipCheckout(pro, "month", "usd"),
      membershipCheckout(pro, "month", "usd"),
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
    await expect(membershipCheckout(pro, "month", "usd")).rejects.toThrow(
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
    await expect(membershipCheckout(pro, "year", "eur")).rejects.toThrow(
      "estado del plan cambió",
    );
  });
  it("una suscripción activa se gestiona en el portal sin crear otra", async () => {
    await patch({
      stripeSubscriptionId: "sub_existing",
      plan: "year",
      status: "active",
    });
    stripe.subscriptionRetrieve.mockResolvedValue({
      id: "sub_existing",
      status: "active",
    });
    const before = await member();
    await expect(membershipCheckout(pro, "month", "usd")).rejects.toThrow(
      "Ya tienes una suscripción",
    );
    expect(await member()).toEqual(before);
    expect(stripe.subscriptionCancel).not.toHaveBeenCalled();
    expect(stripe.checkoutCreate).not.toHaveBeenCalled();
  });
  it("el webhook guarda estado, plan y moneda desde el proveedor", async () => {
    stripe.subscriptionRetrieve.mockResolvedValue({
      id: "sub_new",
      customer: customerId,
      status: "active",
      currency: "gbp",
      metadata: {
        nido_membership_pro: P,
        nido_plan: "year",
        nido_currency: "gbp",
      },
    });
    await handleMembershipEvent({
      id: `${P}-legacy-event`,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_new", metadata: { nido_membership_pro: P } } },
    } as unknown as Parameters<typeof handleMembershipEvent>[0]);
    expect(await member()).toMatchObject({
      stripeSubscriptionId: "sub_new",
      plan: "year",
      currency: "gbp",
      status: "active",
    });
  });
});
