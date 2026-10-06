import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ professional: vi.fn(), checkout: vi.fn() }));
vi.mock("@/lib/practice/access", () => ({
  requirePracticeProfessional: mocks.professional,
  requirePracticeBillingProfessional: vi.fn(),
}));
vi.mock("@/lib/practice/billing", () => ({
  MembershipCheckoutError: class extends Error {},
  membershipCheckout: mocks.checkout,
  startMembershipTrial: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { subscribeSoftware } from "@/app/pro/plan/actions";
import { MEMBERSHIP_PLAN } from "@/lib/practice/membership-plan";

function form(
  plan = "month",
  policy = MEMBERSHIP_PLAN.policyVersion,
  accept = "on",
) {
  const data = new FormData();
  data.set("plan", plan);
  data.set("pricePolicy", policy);
  if (accept) data.set("accept", accept);
  return data;
}

describe("consentimiento al plan vigente", () => {
  beforeEach(() => {
    mocks.professional.mockResolvedValue({
      id: "test-monthly",
      email: "fiction@example.test",
    });
    mocks.checkout.mockResolvedValue("https://checkout.stripe.com/fictitious");
  });
  afterEach(() => vi.resetAllMocks());
  it.each([
    "year",
    "week",
    "",
    "month/year",
  ])("rechaza plan manipulado %s", async (plan) => {
    expect(await subscribeSoftware(null, form(plan))).toMatchObject({
      ok: false,
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("rechaza un formulario anterior de 19 USD que no conoce la política vigente", async () => {
    const old = form();
    old.delete("pricePolicy");
    expect(await subscribeSoftware(null, old)).toMatchObject({
      ok: false,
      message: expect.stringContaining("Recarga"),
    });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("rechaza consentimiento ausente aunque la frecuencia coincida", async () => {
    expect(
      await subscribeSoftware(
        null,
        form("month", MEMBERSHIP_PLAN.policyVersion, ""),
      ),
    ).toMatchObject({ ok: false });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
  it("continúa únicamente con frecuencia y condiciones vigentes aceptadas", async () => {
    await expect(subscribeSoftware(null, form())).rejects.toThrow(
      "redirect:https://checkout.stripe.com/fictitious",
    );
    expect(mocks.checkout).toHaveBeenCalledWith(
      { id: "test-monthly", email: "fiction@example.test" },
      "month",
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
