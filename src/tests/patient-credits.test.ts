import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { patientAccounts, patientConversationLinks } from "@/db/patient-schema";
import {
  careCycles,
  carePlans,
  conversations,
  payments,
  practiceAppointments,
  practicePatients,
  practiceReceipts,
  professionals,
  user,
} from "@/db/schema";
import { cycleCredits, cycleDateLabel } from "@/lib/patient/credits";
import { patientPayments } from "@/lib/patient/queries";

const AT = "2026-10-03T12:00:00.000Z";
const cycle = {
  sessionsCount: 4,
  status: "paid",
  startsAt: "2026-10-01T12:00:00.000Z",
  endsAt: "2026-11-01T12:00:00.000Z",
};
const emptyUsage = {
  consumed: 0,
  completed: 0,
  reserved: 0,
  noShows: 0,
  cancelled: 0,
};
describe("saldo informativo de un ciclo", () => {
  it("muestra año y hora en la zona del paciente, con fallback para fecha inválida", () => {
    const date = cycleDateLabel("2026-10-03T00:00:00.000Z", "America/Caracas");
    expect(date).toContain("2026");
    expect(date).toContain("2 oct");
    expect(date).toContain("08:00");
    expect(cycleDateLabel("inválida", "UTC")).toBe("Fecha por revisar");
  });
  it("no duplica reservas ni presenta ausencias como realizadas", () => {
    expect(
      cycleCredits(
        cycle,
        { consumed: 3, completed: 1, reserved: 1, noShows: 1, cancelled: 2 },
        AT,
      ),
    ).toMatchObject({
      included: 4,
      completed: 1,
      reserved: 1,
      noShows: 1,
      cancelled: 2,
      available: 1,
      otherConsumed: 0,
      state: "active",
    });
  });
  it("bloquea saldo disponible en revisión y en estados desconocidos", () => {
    for (const status of ["needs_review", "refunded", "pending", "unknown"])
      expect(cycleCredits({ ...cycle, status }, emptyUsage, AT)).toMatchObject({
        remaining: 4,
        available: 0,
        state: "needs_review",
      });
  });
  it("respeta los límites exactos de vigencia y permite fechas de un próximo ciclo", () => {
    expect(cycleCredits(cycle, emptyUsage, cycle.startsAt).state).toBe(
      "active",
    );
    expect(cycleCredits(cycle, emptyUsage, cycle.endsAt)).toMatchObject({
      available: 0,
      state: "expired",
    });
    expect(
      cycleCredits(cycle, emptyUsage, "2026-09-30T23:00:00.000Z"),
    ).toMatchObject({ available: 4, state: "upcoming" });
    expect(
      cycleCredits({ ...cycle, endsAt: "inválida" }, emptyUsage, AT).state,
    ).toBe("needs_review");
  });
  it("cero y exceso no producen saldos negativos ni disponibilidad falsa", () => {
    expect(
      cycleCredits({ ...cycle, sessionsCount: 0 }, emptyUsage, AT),
    ).toMatchObject({ available: 0, state: "exhausted" });
    expect(
      cycleCredits(
        { ...cycle, sessionsCount: 2 },
        { ...emptyUsage, consumed: 3, completed: 1, reserved: 2 },
        AT,
      ),
    ).toMatchObject({ remaining: 0, available: 0, state: "overcommitted" });
    expect(
      cycleCredits(cycle, { ...emptyUsage, consumed: 1 }, AT),
    ).toMatchObject({ available: 3, otherConsumed: 1 });
  });
  it("datos de consumo inválidos o contradictorios requieren revisión sin inflar saldo", () => {
    for (const consumed of [-1, Number.NaN, 0.5]) {
      expect(
        cycleCredits(cycle, { ...emptyUsage, consumed }, AT),
      ).toMatchObject({
        state: "needs_review",
        available: 0,
      });
    }
    expect(
      cycleCredits(
        cycle,
        { ...emptyUsage, consumed: 1, completed: 1, reserved: 1 },
        AT,
      ),
    ).toMatchObject({
      state: "needs_review",
      available: 0,
    });
    expect(cycleCredits(cycle, emptyUsage, AT)).toMatchObject({
      state: "active",
      available: 4,
    });
  });
});

const P = "test-m05-credits";
const now = () => new Date().toISOString();
const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString();
async function cleanup() {
  await db
    .delete(practiceAppointments)
    .where(like(practiceAppointments.id, `${P}%`));
  await db.delete(careCycles).where(like(careCycles.id, `${P}%`));
  await db.delete(carePlans).where(like(carePlans.id, `${P}%`));
  await db.delete(practiceReceipts).where(like(practiceReceipts.id, `${P}%`));
  await db.delete(payments).where(like(payments.id, `${P}%`));
  await db.delete(practicePatients).where(like(practicePatients.id, `${P}%`));
  await db
    .delete(patientConversationLinks)
    .where(like(patientConversationLinks.userId, `${P}%`));
  await db.delete(patientAccounts).where(like(patientAccounts.userId, `${P}%`));
  await db.delete(conversations).where(like(conversations.id, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function insertPlan(
  id: string,
  patientId = `${P}-record-owner`,
  professionalId = `${P}-pro`,
) {
  await db.insert(carePlans).values({
    id,
    patientId,
    professionalId,
    title: "Acuerdo ficticio",
    sessionsCount: 4,
    durationMinutes: 50,
    priceCents: 9900,
    currency: "eur",
    interval: "one_time",
    validityDays: 30,
    status: "active",
    createdAt: now(),
  });
}
async function insertCycle(
  suffix: string,
  options: {
    planId?: string;
    sessionsCount?: number;
    status?: string;
    startsAt?: string;
    endsAt?: string;
    currency?: string;
    reference?: string;
  } = {},
) {
  await db.insert(careCycles).values({
    id: `${P}-${suffix}`,
    carePlanId: options.planId ?? `${P}-plan-owner`,
    sessionsCount: options.sessionsCount ?? 4,
    status: options.status ?? "paid",
    startsAt: options.startsAt ?? day(-20),
    endsAt: options.endsAt ?? day(20),
    amountCents: 9900,
    currency: options.currency ?? "usd",
    externalReference: options.reference ?? `external:${P}-${suffix}`,
    createdAt: now(),
  });
}
async function appointment(suffix: string, status: string, offset: number) {
  const startsAt = day(offset);
  await db.insert(practiceAppointments).values({
    id: `${P}-${suffix}`,
    professionalId: `${P}-pro`,
    patientId: `${P}-record-owner`,
    careCycleId: `${P}-cycle-main`,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 3_000_000).toISOString(),
    status,
    timeZone: "UTC",
    createdAt: now(),
    updatedAt: now(),
  });
}
describe("proyección propia y acotada de pagos/créditos", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values(
      ["owner", "other", "prouser", "wrongpro"].map((suffix) => ({
        id: `${P}-${suffix}`,
        name: "Cuenta ficticia",
        email: `${P}-${suffix}@example.test`,
        emailVerified: true,
      })),
    );
    await db.insert(professionals).values(
      ["pro", "wrongpro"].map((suffix) => ({
        id: `${P}-${suffix}`,
        userId: `${P}-${suffix === "pro" ? "prouser" : "wrongpro"}`,
        fullName: "Profesional ficticio",
        email: `${P}-${suffix}@example.test`,
        languages: '["es"]',
        supportAreas: '["ansiedad_depresion"]',
        status: "paused",
        createdAt: now(),
        updatedAt: now(),
      })),
    );
    await db.insert(patientAccounts).values(
      ["owner", "other"].map((suffix) => ({
        userId: `${P}-${suffix}`,
        displayName: "Alias ficticio",
        createdAt: now(),
        updatedAt: now(),
      })),
    );
    for (const suffix of ["owner", "other", "free", "unlinked"]) {
      await db.insert(conversations).values({
        id: `${P}-chat-${suffix}`,
        professionalId: `${P}-pro`,
        seekerSid: `${P}-sid-${suffix}`,
        status: "closed",
        createdAt: now(),
        updatedAt: now(),
      });
      await db.insert(practicePatients).values({
        id: `${P}-record-${suffix}`,
        professionalId: `${P}-pro`,
        conversationId: `${P}-chat-${suffix}`,
        name: "Ficha ficticia",
        country: "VE",
        program: suffix === "free" ? "earthquake" : "general",
        consentAt: now(),
        createdAt: now(),
        updatedAt: now(),
      });
      if (suffix !== "unlinked")
        await db.insert(patientConversationLinks).values({
          conversationId: `${P}-chat-${suffix}`,
          userId: `${P}-${suffix === "other" ? "other" : "owner"}`,
          verifiedBy: "verified_email",
          verifiedAt: now(),
        });
      await insertPlan(`${P}-plan-${suffix}`, `${P}-record-${suffix}`);
    }
    await insertPlan(
      `${P}-plan-mismatch`,
      `${P}-record-owner`,
      `${P}-wrongpro`,
    );
    await insertCycle("cycle-main");
    await insertCycle("cycle-review", {
      status: "needs_review",
      currency: "eur",
    });
    await insertCycle("cycle-future", { startsAt: day(30), endsAt: day(60) });
    await insertCycle("cycle-expired", {
      startsAt: day(-60),
      endsAt: day(-30),
    });
    await insertCycle("cycle-zero", { sessionsCount: 0 });
    await insertCycle("cycle-provider", {
      reference: `stripe:${P}-invoice`,
      currency: "ves",
    });
    for (const suffix of ["other", "free", "unlinked", "mismatch"])
      await insertCycle(`cycle-${suffix}`, { planId: `${P}-plan-${suffix}` });
    await appointment("cancelled", "cancelled", -5);
    await appointment("completed", "completed", -4);
    await appointment("absence", "no_show", -3);
    await appointment("past-reservation", "scheduled", -2);
    await db.insert(practiceReceipts).values(
      ["owner", "other", "free"].map((suffix) => ({
        id: `${P}-receipt-${suffix}`,
        professionalId: `${P}-pro`,
        patientId: `${P}-record-${suffix}`,
        amountCents: 2500,
        currency: "eur",
        method: "zelle",
        reference: `${P}-receipt-reference-${suffix}`,
        receivedAt: now(),
      })),
    );
    await db.insert(payments).values(
      ["owner", "other", "free"].map((suffix) => ({
        id: `${P}-card-${suffix}`,
        professionalId: `${P}-pro`,
        conversationId: `${P}-chat-${suffix}`,
        amountCents: 3500,
        applicationFeeCents: 0,
        currency: "usd",
        status: "paid",
        createdAt: now(),
        updatedAt: now(),
      })),
    );
  });
  afterAll(cleanup);
  it("separa cuentas, profesional coincidente, vínculo y programa gratuito", async () => {
    const own = await patientPayments(`${P}-owner`);
    expect(own.plans.map((p) => p.id)).toEqual([`${P}-plan-owner`]);
    expect(own.cyclesPagination.total).toBe(6);
    expect(own.rows.map((p) => p.id)).toEqual([`${P}-receipt-owner`]);
    expect(own.cards.map((p) => p.id)).toEqual([`${P}-card-owner`]);
    const other = await patientPayments(`${P}-other`);
    expect(other.cycles.map((c) => c.id)).toEqual([`${P}-cycle-other`]);
    expect(other.plans[0].id).toBe(`${P}-plan-other`);
    expect((await patientPayments(`${P}-missing`)).cycles).toEqual([]);
  });
  it("proyecta las reservas pasadas sin darlas por realizadas y conserva origen/moneda", async () => {
    const result = await patientPayments(`${P}-owner`);
    const main = result.cycles.find((c) => c.id === `${P}-cycle-main`);
    expect(main?.credits).toMatchObject({
      included: 4,
      completed: 1,
      reserved: 1,
      noShows: 1,
      cancelled: 1,
      consumed: 3,
      available: 1,
    });
    expect(main?.planId).toBe(`${P}-plan-owner`);
    expect(main?.confirmation).toBe("manual");
    expect(main?.currency).toBe("usd");
    expect(
      result.cycles.find((c) => c.id === `${P}-cycle-provider`),
    ).toMatchObject({ confirmation: "processor", currency: "ves" });
    expect(
      result.cycles.find((c) => c.id === `${P}-cycle-review`)?.credits
        .available,
    ).toBe(0);
    expect(
      result.cycles.find((c) => c.id === `${P}-cycle-expired`)?.credits.state,
    ).toBe("expired");
    expect(
      result.cycles.find((c) => c.id === `${P}-cycle-future`)?.credits.state,
    ).toBe("upcoming");
    expect(
      result.cycles.find((c) => c.id === `${P}-cycle-zero`)?.credits.available,
    ).toBe(0);
  });
  it("reservar, impedir sobreconsumo y cancelar concuerda con los triggers", async () => {
    await appointment("last-reservation", "scheduled", 5);
    try {
      let main = (await patientPayments(`${P}-owner`)).cycles.find(
        (c) => c.id === `${P}-cycle-main`,
      );
      expect(main?.credits).toMatchObject({
        consumed: 4,
        reserved: 2,
        available: 0,
      });
      await expect(
        appointment("overflow", "scheduled", 6),
      ).rejects.toMatchObject({
        cause: { message: expect.stringContaining("care_cycle_unavailable") },
      });
      expect(
        await db.query.practiceAppointments.findFirst({
          where: eq(practiceAppointments.id, `${P}-overflow`),
        }),
      ).toBeUndefined();
      await db
        .update(practiceAppointments)
        .set({ status: "cancelled" })
        .where(eq(practiceAppointments.id, `${P}-last-reservation`));
      main = (await patientPayments(`${P}-owner`)).cycles.find(
        (c) => c.id === `${P}-cycle-main`,
      );
      expect(main?.credits).toMatchObject({
        consumed: 3,
        reserved: 1,
        available: 1,
      });
    } finally {
      await db
        .delete(practiceAppointments)
        .where(eq(practiceAppointments.id, `${P}-last-reservation`));
    }
  });
  it("un saldo sobrecomprometido se conserva para revisión y nunca es negativo", async () => {
    await db
      .update(careCycles)
      .set({ sessionsCount: 2 })
      .where(eq(careCycles.id, `${P}-cycle-main`));
    try {
      const main = (await patientPayments(`${P}-owner`)).cycles.find(
        (c) => c.id === `${P}-cycle-main`,
      );
      expect(main?.credits).toMatchObject({
        included: 2,
        consumed: 3,
        available: 0,
        state: "overcommitted",
      });
    } finally {
      await db
        .update(careCycles)
        .set({ sessionsCount: 4 })
        .where(eq(careCycles.id, `${P}-cycle-main`));
    }
  });
  it("una baja, chat borrado o anonimizado oculta filas y totales propios", async () => {
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, `${P}-owner`));
    try {
      const result = await patientPayments(`${P}-owner`);
      expect([
        result.rows.length,
        result.plans.length,
        result.cycles.length,
        result.cards.length,
        result.total,
        result.cyclesPagination.total,
      ]).toEqual([0, 0, 0, 0, 0, 0]);
    } finally {
      await db
        .update(patientAccounts)
        .set({ deletionState: "active" })
        .where(eq(patientAccounts.userId, `${P}-owner`));
    }
    for (const field of ["deletedAt", "anonymizedAt"] as const) {
      await db
        .update(conversations)
        .set({ [field]: new Date() })
        .where(eq(conversations.id, `${P}-chat-owner`));
      try {
        const result = await patientPayments(`${P}-owner`);
        expect([
          result.rows.length,
          result.plans.length,
          result.cycles.length,
          result.cards.length,
        ]).toEqual([0, 0, 0, 0]);
      } finally {
        await db
          .update(conversations)
          .set({ [field]: null })
          .where(eq(conversations.id, `${P}-chat-owner`));
      }
    }
  });
  it("pagina cada colección sin unir ciclos y permite continuidad financiera con chat cerrado/pro suspendido", async () => {
    for (let i = 0; i < 21; i++) await insertCycle(`page-${i}`);
    try {
      const first = await patientPayments(`${P}-owner`, "99999", {
        cyclesPage: "1",
      });
      const second = await patientPayments(`${P}-owner`, "1", {
        cyclesPage: "2",
      });
      expect(first.cycles.length).toBe(20);
      expect(second.cycles.length).toBe(7);
      expect(first.cyclesPagination).toMatchObject({
        total: 27,
        pages: 2,
        page: 1,
      });
      expect(
        new Set([...first.cycles, ...second.cycles].map((c) => c.id)).size,
      ).toBe(27);
      expect(first.page).toBe(1);
      const main = [...first.cycles, ...second.cycles].find(
        (c) => c.id === `${P}-cycle-main`,
      );
      expect(main?.credits.available).toBe(1);
    } finally {
      await db.delete(careCycles).where(like(careCycles.id, `${P}-page-%`));
    }
  });
});
