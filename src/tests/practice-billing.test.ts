import { eq, like } from "drizzle-orm";
import type Stripe from "stripe";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import {
  careCycles,
  carePlans,
  practiceCallRooms,
  practicePatients,
  professionalMemberships,
  professionals,
  stripeEvents,
  user,
} from "@/db/schema";

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(),
  cancel: vi.fn(),
  checkoutList: vi.fn(),
  invoiceList: vi.fn(),
  checkoutCreate: vi.fn(),
  session: vi.fn(),
  stripeAvailable: true,
}));
vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () =>
    mocks.stripeAvailable
      ? {
          subscriptions: { retrieve: mocks.retrieve, cancel: mocks.cancel },
          checkout: {
            sessions: {
              list: mocks.checkoutList,
              create: mocks.checkoutCreate,
            },
          },
          invoicePayments: { list: mocks.invoiceList },
        }
      : null,
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));

import {
  handleMembershipEvent,
  membershipCheckout,
} from "@/lib/practice/billing";
import { handleCareEvent } from "@/lib/practice/care";
import { preparePracticePurge } from "@/lib/practice/purge";
import { requirePracticeStaff } from "@/lib/practice/staff";

const P = "test-practice-billing";
const stamp = () => new Date().toISOString();
const event = (
  type: string,
  object: Record<string, unknown>,
  id = `${P}-${type}`,
) => ({ id, type, data: { object } }) as unknown as Stripe.Event;
async function cleanup() {
  await db.delete(stripeEvents).where(like(stripeEvents.id, `${P}%`));
  await db
    .delete(practiceCallRooms)
    .where(eq(practiceCallRooms.professionalId, P));
  await db.delete(careCycles).where(like(careCycles.id, `${P}%`));
  const plans = await db
    .select()
    .from(carePlans)
    .where(eq(carePlans.professionalId, P));
  for (const plan of plans)
    await db.delete(careCycles).where(eq(careCycles.carePlanId, plan.id));
  await db.delete(carePlans).where(eq(carePlans.professionalId, P));
  await db
    .delete(practicePatients)
    .where(eq(practicePatients.professionalId, P));
  await db
    .delete(professionalMemberships)
    .where(eq(professionalMemberships.professionalId, P));
  await db.delete(professionals).where(eq(professionals.id, P));
  await db.delete(user).where(like(user.id, `${P}%`));
}
describe("facturación separada, reintentos y permisos del equipo", () => {
  beforeAll(async () => {
    await cleanup();
    await db
      .insert(user)
      .values({ id: P, name: "Cuenta ficticia", email: `${P}@example.test` });
    await db.insert(user).values({
      id: `${P}-staff`,
      name: "Soporte ficticio",
      email: "support@example.test",
      emailVerified: true,
    });
    await db.insert(professionals).values({
      id: P,
      userId: P,
      email: `${P}@example.test`,
      fullName: "Profesional ficticio",
      status: "approved",
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: stamp(),
      updatedAt: stamp(),
    });
    await db.insert(practicePatients).values({
      id: P,
      professionalId: P,
      name: "Paciente ficticio",
      country: "Venezuela",
      consentAt: stamp(),
      createdAt: stamp(),
      updatedAt: stamp(),
    });
    for (const suffix of ["one", "month"])
      await db.insert(carePlans).values({
        id: `${P}-${suffix}`,
        professionalId: P,
        patientId: P,
        title: "Acuerdo ficticio",
        sessionsCount: 4,
        durationMinutes: 50,
        priceCents: 10000,
        currency: "usd",
        interval: suffix === "month" ? "month" : "one_time",
        validityDays: 30,
        createdAt: stamp(),
      });
    await db.insert(professionalMemberships).values({
      professionalId: P,
      trialStartedAt: stamp(),
      trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
      stripeCustomerId: `${P}-customer`,
      updatedAt: stamp(),
    });
  });
  afterAll(cleanup);
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.stripeAvailable = true;
  });
  it("ignora los eventos de otra actividad de la cuenta Stripe", async () => {
    expect(
      await handleMembershipEvent(
        event("checkout.session.completed", { metadata: { other: "product" } }),
      ),
    ).toBe(false);
    expect(
      await handleCareEvent(
        event("checkout.session.completed", { metadata: { other: "product" } }),
      ),
    ).toBe(false);
  });
  it("un pago único repetido confirma una sola cantidad de sesiones", async () => {
    const e = event("checkout.session.completed", {
      id: `${P}-checkout`,
      metadata: { nido_care_plan: `${P}-one` },
      payment_status: "paid",
      amount_total: 10000,
    });
    await handleCareEvent(e);
    await handleCareEvent(e);
    const cycles = await db
      .select()
      .from(careCycles)
      .where(eq(careCycles.carePlanId, `${P}-one`));
    expect(cycles).toHaveLength(1);
    expect(cycles[0].sessionsCount).toBe(4);
    expect(
      await db.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, P),
      }),
    ).toMatchObject({ stripeSubscriptionId: null });
  });
  it("invoice antes de checkout y repetida crea un solo ciclo mensual", async () => {
    mocks.retrieve.mockResolvedValue({
      id: `${P}-subscription`,
      status: "active",
      metadata: { nido_care_plan: `${P}-month` },
      customer: `${P}-patient-customer`,
    });
    const e = event("invoice.paid", {
      id: `${P}-invoice`,
      status: "paid",
      amount_paid: 10000,
      currency: "usd",
      period_start: 1893456000,
      period_end: 1896134400,
      lines: {
        data: [
          {
            parent: { type: "subscription_item_details" },
            period: { start: 1893456000, end: 1896134400 },
          },
        ],
      },
      parent: { subscription_details: { subscription: `${P}-subscription` } },
    });
    await handleCareEvent(e);
    await handleCareEvent(e);
    expect(
      await db
        .select()
        .from(careCycles)
        .where(eq(careCycles.carePlanId, `${P}-month`)),
    ).toHaveLength(1);
    expect(
      await db.query.carePlans.findFirst({
        where: eq(carePlans.id, `${P}-month`),
      }),
    ).toMatchObject({
      status: "active",
      stripeSubscriptionId: `${P}-subscription`,
    });
  });
  it("un impago antiguo no degrada una suscripción actualmente activa", async () => {
    mocks.retrieve.mockResolvedValue({
      id: `${P}-subscription`,
      status: "active",
      metadata: { nido_care_plan: `${P}-month` },
    });
    await handleCareEvent(
      event("invoice.payment_failed", {
        parent: { subscription_details: { subscription: `${P}-subscription` } },
      }),
    );
    expect(
      await db.query.carePlans.findFirst({
        where: eq(carePlans.id, `${P}-month`),
      }),
    ).toMatchObject({ status: "active" });
  });
  it("el reembolso pone los créditos afectados en revisión", async () => {
    mocks.checkoutList.mockResolvedValue({
      data: [{ id: `${P}-checkout` }],
      has_more: false,
    });
    mocks.invoiceList.mockResolvedValue({ data: [], has_more: false });
    await handleCareEvent(
      event("charge.refunded", { payment_intent: `${P}-intent` }),
    );
    expect(
      await db.query.careCycles.findFirst({
        where: eq(careCycles.externalReference, `stripe:${P}-checkout`),
      }),
    ).toMatchObject({ status: "needs_review" });
  });
  it("el estado del software proviene del proveedor y es idempotente", async () => {
    mocks.retrieve.mockResolvedValue({
      id: `${P}-software`,
      status: "canceled",
      metadata: { nido_membership_pro: P, nido_plan: "month" },
      customer: `${P}-customer`,
    });
    const e = event("customer.subscription.updated", {
      id: `${P}-software`,
      status: "active",
      metadata: { nido_membership_pro: P },
    });
    await handleMembershipEvent(e);
    await handleMembershipEvent(e);
    expect(mocks.retrieve).toHaveBeenCalledTimes(1);
    expect(
      await db.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, P),
      }),
    ).toMatchObject({
      status: "canceled",
      stripeSubscriptionId: `${P}-software`,
    });
  });
  it("no adelanta el cobro en las últimas 48 horas de la prueba", async () => {
    vi.stubEnv("NIDO_MEMBERSHIP_BILLING_ENABLED", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "fixture");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "fixture");
    await expect(
      membershipCheckout({ id: P, email: `${P}@example.test` }, "month"),
    ).rejects.toThrow("Tu prueba sigue activa");
    expect(mocks.checkoutCreate).not.toHaveBeenCalled();
  });
  it("una baja conserva punteros cuando el proveedor no está configurado", async () => {
    mocks.stripeAvailable = false;
    await expect(preparePracticePurge(P)).rejects.toThrow(
      "cancelación de cobros",
    );
    expect(
      await db.query.professionalMemberships.findFirst({
        where: eq(professionalMemberships.professionalId, P),
      }),
    ).toBeTruthy();
  });
  it("soporte no obtiene permisos de revisión de credenciales", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("SUPPORT_EMAILS", "support@example.test");
    vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", "reviewer@example.test");
    mocks.session.mockResolvedValue({
      user: {
        id: `${P}-staff`,
        email: "support@example.test",
        emailVerified: true,
      },
    });
    expect(await requirePracticeStaff("support")).toEqual({
      email: "support@example.test",
    });
    expect(await requirePracticeStaff("credentials")).toBeNull();
  });
});
