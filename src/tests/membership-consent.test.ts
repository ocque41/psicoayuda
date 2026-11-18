import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ professional: vi.fn(), checkout: vi.fn() }));
vi.mock("@/lib/practice/access", () => ({
  requirePracticeProfessional: vi.fn(),
  requirePracticeBillingProfessional: mocks.professional,
}));
vi.mock("@/lib/practice/billing", () => ({
  MembershipCheckoutError: class extends Error {},
  membershipCheckout: mocks.checkout,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { subscribeSoftware } from "@/app/pro/plan/actions";
import { MEMBERSHIP_POLICY_VERSION } from "@/lib/practice/membership-plan";

function form(
  plan = "month",
  currency = "eur",
  policy: string = MEMBERSHIP_POLICY_VERSION,
  accept = "on",
) {
  const data = new FormData();
  data.set("plan", plan);
  data.set("currency", currency);
  data.set("pricePolicy", policy);
  if (accept) data.set("accept", accept);
  return data;
}

describe("consentimiento a los planes vigentes", () => {
  beforeEach(() => {
    mocks.professional.mockResolvedValue({
      id: "test-plan",
      email: "fiction@example.test",
      status: "approved",
    });
    mocks.checkout.mockResolvedValue("https://checkout.stripe.com/fictitious");
  });
  afterEach(() => vi.resetAllMocks());
  it.each([
    "week",
    "",
    "month/year",
  ])("rechaza plan manipulado %s", async (plan) => {
    expect(await subscribeSoftware(null, form(plan))).toMatchObject({
      ok: false,
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it.each([
    "jpy",
    "",
    "EUR",
  ])("rechaza moneda no ofrecida %s", async (currency) => {
    expect(
      await subscribeSoftware(null, form("month", currency)),
    ).toMatchObject({ ok: false });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("rechaza un formulario con la política anterior de 10 USD", async () => {
    expect(
      await subscribeSoftware(null, form("month", "usd", "monthly-usd-10-v1")),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("Recarga"),
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("rechaza consentimiento ausente aunque el plan coincida", async () => {
    expect(
      await subscribeSoftware(
        null,
        form("year", "gbp", MEMBERSHIP_POLICY_VERSION, ""),
      ),
    ).toMatchObject({ ok: false });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it.each([
    ["month", "usd"],
    ["year", "eur"],
    ["year", "gbp"],
  ])("continúa con %s en %s y condiciones aceptadas", async (plan, currency) => {
    await expect(subscribeSoftware(null, form(plan, currency))).rejects.toThrow(
      "redirect:https://checkout.stripe.com/fictitious",
    );
    expect(mocks.checkout).toHaveBeenCalledWith(
      { id: "test-plan", email: "fiction@example.test", status: "approved" },
      plan,
      currency,
    );
  });
  it("los fallos inesperados se muestran en español sin exponer detalles internos", async () => {
    mocks.checkout.mockRejectedValue(
      new Error("Failed query with private internal details"),
    );
    expect(await subscribeSoftware(null, form())).toEqual({
      ok: false,
      message:
        "No pudimos preparar tu pago. Comprueba tu plan y reintenta en un momento.",
    });
  });
});
