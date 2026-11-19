import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const email = vi.hoisted(() => ({
  send: vi.fn(async (_input: { to: string }) => ({ ok: true })),
}));
vi.mock("@/lib/email", () => ({ sendEmail: email.send }));

import { notifyAdminScreeningSubmitted } from "@/lib/notifications";
import { sessionPaymentsEnabled } from "@/lib/payments/config";
import {
  MEMBERSHIP_PRODUCT_ID,
  membershipPortalConfiguration,
  membershipProductId,
  resetStripeCatalogCache,
} from "@/lib/practice/stripe-catalog";

function fakeStripe(options: {
  product?: { active: boolean } | "missing";
  portals?: { id: string; metadata: Record<string, string> }[];
}) {
  const missing = Object.assign(new Error("No such product"), {
    code: "resource_missing",
  });
  return {
    products: {
      retrieve: vi.fn(async () => {
        if (options.product === "missing") throw missing;
        return options.product ?? { active: true };
      }),
      create: vi.fn(async (input: { id: string }) => input),
      update: vi.fn(),
    },
    billingPortal: {
      configurations: {
        list: vi.fn(async () => ({ data: options.portals ?? [] })),
        create: vi.fn(async () => ({ id: "bpc_nido" })),
      },
    },
  };
}
type Fake = ReturnType<typeof fakeStripe>;
const asStripe = (fake: Fake) =>
  fake as unknown as Parameters<typeof membershipProductId>[0];

beforeEach(() => resetStripeCatalogCache());
afterEach(() => {
  vi.unstubAllEnvs();
  email.send.mockClear();
});

describe("cuenta de Stripe compartida con Bandicot", () => {
  it("crea una sola vez el producto propio de Nido, sin claves de Bandicot", async () => {
    const fake = fakeStripe({ product: "missing" });
    expect(await membershipProductId(asStripe(fake))).toBe(
      "nido_software_profesional",
    );
    expect(await membershipProductId(asStripe(fake))).toBe(
      MEMBERSHIP_PRODUCT_ID,
    );
    expect(fake.products.create).toHaveBeenCalledOnce();
    const [product, options] = fake.products.create.mock
      .calls[0] as unknown as [
      Record<string, unknown>,
      { idempotencyKey: string },
    ];
    expect(product).toMatchObject({
      id: "nido_software_profesional",
      name: "Nido · Software profesional",
      statement_descriptor: "NIDO SOFTWARE",
    });
    expect(JSON.stringify(product)).not.toContain("bandicot");
    expect(options.idempotencyKey).toBe(
      "nido-product-nido_software_profesional",
    );
  });

  it("reactiva el producto si alguien lo archivó y no lo duplica", async () => {
    const fake = fakeStripe({ product: { active: false } });
    await membershipProductId(asStripe(fake));
    expect(fake.products.update).toHaveBeenCalledWith(MEMBERSHIP_PRODUCT_ID, {
      active: true,
    });
    expect(fake.products.create).not.toHaveBeenCalled();
  });

  it("usa un portal propio y nunca el portal por defecto de Bandicot", async () => {
    const fake = fakeStripe({
      portals: [
        { id: "bpc_bandicot", metadata: {} },
        {
          id: "bpc_nido_existente",
          metadata: { nido: "membership-portal-v1" },
        },
      ],
    });
    expect(await membershipPortalConfiguration(asStripe(fake))).toBe(
      "bpc_nido_existente",
    );
    expect(fake.billingPortal.configurations.create).not.toHaveBeenCalled();

    resetStripeCatalogCache();
    const empty = fakeStripe({
      portals: [{ id: "bpc_bandicot", metadata: {} }],
    });
    expect(await membershipPortalConfiguration(asStripe(empty))).toBe(
      "bpc_nido",
    );
    const [config] = empty.billingPortal.configurations.create.mock
      .calls[0] as unknown as [
      {
        features: { subscription_update: { enabled: boolean } };
        metadata: Record<string, string>;
      },
    ];
    expect(config.features.subscription_update.enabled).toBe(false);
    expect(config.metadata).toEqual({ nido: "membership-portal-v1" });
  });

  it("los paquetes de sesiones con Connect siguen apagados aunque haya claves", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_ficticia");
    vi.stubEnv("NIDO_SESSION_PAYMENTS_ENABLED", "");
    expect(sessionPaymentsEnabled()).toBe(false);
    vi.stubEnv("NIDO_SESSION_PAYMENTS_ENABLED", "true");
    expect(sessionPaymentsEnabled()).toBe(true);
  });
});

describe("aviso de cuestionario enviado", () => {
  it("llega a todas las administradoras sin datos de la candidatura", async () => {
    vi.stubEnv(
      "ADMIN_EMAILS",
      "admin-a@example.test, admin-b@example.test,revisora@example.test",
    );
    await notifyAdminScreeningSubmitted();
    const calls = email.send.mock.calls.map(([input]) => input) as {
      to: string;
      subject: string;
      text: string;
    }[];
    expect(calls.map((call) => call.to).sort()).toEqual([
      "admin-a@example.test",
      "admin-b@example.test",
      "revisora@example.test",
    ]);
    expect(calls[0].subject).toBe(
      "Nueva solicitud profesional para revisar — Nido",
    );
    expect(calls[0].text).toContain("/admin/admision");
    expect(calls[0].text).not.toContain("@");
  });
});
