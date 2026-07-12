import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { clickEvents, contactMessages } from "@/db/schema";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));

vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));

import { GET } from "@/app/api/admin/metrics/route";

const ids = {
  contact: "test-metrics-contact",
  signup: "test-metrics-signup",
  share: "test-metrics-share",
  email: "test-metrics-email",
};

async function cleanup() {
  await db.delete(contactMessages).where(eq(contactMessages.id, ids.contact));
  await db
    .delete(clickEvents)
    .where(inArray(clickEvents.id, [ids.signup, ids.share, ids.email]));
}

beforeAll(async () => {
  await cleanup();
  const timestamp = new Date();
  await db.insert(clickEvents).values([
    {
      id: ids.signup,
      type: "signup",
      page: "/pro/onboarding",
      utmSource: "whatsapp",
      utmMedium: "referral",
      utmCampaign: "referidos_profesionales",
      createdAt: timestamp,
    },
    {
      id: ids.share,
      type: "professional_referral_share",
      label: "Intento de compartir invitación profesional",
      page: "/pro/dashboard",
      createdAt: timestamp,
    },
    {
      id: ids.email,
      type: "contact_email",
      label: "Contacto público · ocquema@gmail.com",
      page: "/contacto",
      createdAt: timestamp,
    },
  ]);
  const iso = timestamp.toISOString();
  await db.insert(contactMessages).values({
    id: ids.contact,
    source: "public_contact",
    category: "question",
    email: "test-metrics@example.com",
    message: "Mensaje para comprobar el agregado de métricas.",
    status: "new",
    createdAt: iso,
    updatedAt: iso,
  });
});

afterAll(cleanup);

describe("métricas administrativas", () => {
  it("agrega las tres ventanas sin acercarse al límite de consultas D1", async () => {
    mocks.requireAdmin.mockResolvedValue({
      email: "admin@example.com",
      session: {},
    });
    const querySpy = vi.spyOn(db, "all");

    const response = await GET();
    const body = (await response.json()) as {
      windows: Array<{
        key: string;
        contactForms: number;
        emailClicks: number;
        referralShares: number;
        referralSignups: number;
        signups: number;
      }>;
    };

    expect(response.status).toBe(200);
    expect(querySpy).toHaveBeenCalledTimes(12);
    expect(body.windows).toHaveLength(3);
    expect(body.windows[0]).toMatchObject({
      key: "24h",
      contactForms: 1,
      emailClicks: 1,
      referralShares: 1,
      referralSignups: 1,
      signups: 1,
    });
    querySpy.mockRestore();
  });
});
