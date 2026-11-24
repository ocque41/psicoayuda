import { eq, like } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const email = vi.hoisted(() => ({
  send: vi.fn(
    async (_input: { to: string }) => ({ ok: true }) as { ok: boolean },
  ),
}));
vi.mock("@/lib/email", () => ({ sendEmail: email.send }));

import { db } from "@/db";
import { professionalScreenings, professionals, user } from "@/db/schema";
import {
  runScreeningReminderJobs,
  screeningReminderEmailContent,
} from "@/lib/screening/reminders";

const P = "test-screening-reminder";
const hoursAgo = (hours: number) =>
  new Date(Date.now() - hours * 3_600_000).toISOString();

async function cleanup() {
  await db
    .delete(professionalScreenings)
    .where(like(professionalScreenings.professionalId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
async function candidate(
  suffix: string,
  values: Partial<typeof professionals.$inferInsert> = {},
) {
  const id = `${P}-${suffix}`;
  await db
    .insert(user)
    .values({ id, name: "Candidatura ficticia", email: `${id}@example.test` });
  await db.insert(professionals).values({
    id,
    userId: id,
    email: `${id}@example.test`,
    fullName: "Ana Ficticia",
    status: "pending_verification",
    languages: '["es"]',
    supportAreas: "[]",
    createdAt: hoursAgo(48),
    updatedAt: hoursAgo(48),
    ...values,
  });
  return id;
}
async function remindedAt(id: string) {
  return (
    await db.query.professionals.findFirst({
      where: eq(professionals.id, id),
      columns: { screeningRemindedAt: true },
    })
  )?.screeningRemindedAt;
}

describe("recordatorio del cuestionario clínico", () => {
  beforeEach(async () => {
    await cleanup();
    email.send.mockReset();
    email.send.mockResolvedValue({ ok: true });
  });
  afterAll(cleanup);

  it("avisa una vez a quien lleva más de 24 h sin enviar el cuestionario", async () => {
    const due = await candidate("due");
    const draft = await candidate("draft");
    await db.insert(professionalScreenings).values({
      professionalId: draft,
      version: "v",
      createdAt: hoursAgo(30),
      updatedAt: hoursAgo(30),
    });
    const recent = await candidate("recent", { createdAt: hoursAgo(2) });
    const sent = await candidate("sent");
    await db.insert(professionalScreenings).values({
      professionalId: sent,
      version: "v",
      submittedAt: hoursAgo(20),
      createdAt: hoursAgo(30),
      updatedAt: hoursAgo(20),
    });
    const helper = await candidate("helper", { nonClinicalHelper: true });
    const approved = await candidate("approved", { status: "approved" });

    await runScreeningReminderJobs();
    const recipients = email.send.mock.calls
      .map(([input]) => input.to)
      .filter((to) => to.startsWith(P))
      .sort();
    // El apoyo voluntario también completa el cuestionario: recibe el aviso.
    expect(recipients).toEqual(
      [
        `${due}@example.test`,
        `${draft}@example.test`,
        `${helper}@example.test`,
      ].sort(),
    );
    for (const id of [recent, sent, approved])
      expect(await remindedAt(id)).toBeNull();
    email.send.mockClear();
    await runScreeningReminderJobs();
    expect(
      email.send.mock.calls.filter(([input]) => input.to.startsWith(P)),
    ).toHaveLength(0);
  });

  it("un envío fallido se reintenta en la siguiente pasada", async () => {
    const id = await candidate("retry");
    email.send.mockImplementation(async (input: { to: string }) =>
      input.to.startsWith(P) ? { ok: false } : { ok: true },
    );
    await runScreeningReminderJobs();
    expect(await remindedAt(id)).toBeNull();
    email.send.mockResolvedValue({ ok: true });
    await runScreeningReminderJobs();
    expect(await remindedAt(id)).not.toBeNull();
  });

  it("el correo lleva al cuestionario sin datos clínicos", () => {
    const content = screeningReminderEmailContent("Ana");
    expect(content.subject).toBe("Te falta un paso para tu solicitud en Nido");
    expect(content.text).toContain("Hola, Ana:");
    expect(content.text).toContain("/pro/cuestionario");
    expect(content.html).not.toContain("<script");
  });
});
