import { type Client, createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
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
import {
  appointmentReminderDeliveries as deliveries,
  appointmentReminderPreferences as preferences,
} from "@/db/reminder-schema";
import * as schema from "@/db/schema";

const fixture = vi.hoisted(() => ({
  db: undefined as unknown as ReturnType<typeof drizzle<typeof schema>>,
}));
vi.mock("@/db", () => ({
  get db() {
    return fixture.db;
  },
}));

import type {
  ReminderEmailInput,
  ReminderEmailResult,
} from "@/lib/practice/reminder-email";
import {
  claimAppointmentReminder,
  enqueueAppointmentReminders,
  runAppointmentReminderJobs,
} from "@/lib/practice/reminders";

const P = "fixture-reminder-budget-";
const AT = Date.parse("2026-10-07T12:00:00.000Z");
const iso = (at: number) => new Date(at).toISOString();
let client: Client;
let clock: number;
let capture = false;
let queries: string[] = [];
let maxParams = 0;
let afterQuery: (sql: string) => void | Promise<void> = () => {};
const costs = () => ({
  statements: queries.length,
  writes: queries.filter((q) =>
    /^(INSERT|UPDATE|DELETE|WITH candidate)/i.test(q.trim()),
  ).length,
});
const sender = () => vi.fn(async () => ({ ok: true as const }));
async function clean() {
  for (const [table, column] of [
    ["appointment_reminder_deliveries", "user_id"],
    ["appointment_reminder_preferences", "user_id"],
    ["practice_appointments", "id"],
    ["practice_patients", "id"],
    ["professionals", "id"],
    ["user", "id"],
  ])
    await client.execute({
      sql: `DELETE FROM ${table} WHERE ${column} LIKE ?`,
      args: [`${P}%`],
    });
}
async function seed(count: number) {
  for (let i = 0; i < count; i++) {
    const id = `${P}${String(i).padStart(3, "0")}`;
    await fixture.db.insert(schema.user).values({
      id,
      name: "Cuenta ficticia",
      email: `${id}@example.test`,
      emailVerified: true,
    });
    await fixture.db.insert(schema.professionals).values({
      id,
      userId: id,
      fullName: "Profesional ficticio",
      email: `${id}@example.test`,
      languages: '["es"]',
      supportAreas: "[]",
      status: "approved",
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
    await fixture.db.insert(schema.practicePatients).values({
      id,
      professionalId: id,
      name: "Ficha ficticia",
      country: "VE",
      status: "active",
      consentAt: iso(AT),
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
    await fixture.db.insert(schema.practiceAppointments).values({
      id,
      professionalId: id,
      patientId: id,
      startsAt: iso(AT + 7200000),
      endsAt: iso(AT + 10800000),
      timeZone: "UTC",
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
    await fixture.db.insert(preferences).values({
      userId: id,
      role: "professional",
      emailEnabled: true,
      offsetsJson: "[120]",
      timeZone: "UTC",
      revision: 1,
      createdAt: iso(AT - 3600000),
      updatedAt: iso(AT - 3600000),
    });
  }
}
async function run(
  send: (input: ReminderEmailInput) => Promise<ReminderEmailResult> = sender(),
  limit?: number,
) {
  queries = [];
  maxParams = 0;
  capture = true;
  try {
    return await runAppointmentReminderJobs({ now: () => clock, send, limit });
  } finally {
    capture = false;
  }
}
describe("presupuesto de correo desde enqueue con SQL ficticio real", () => {
  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url?.startsWith("file:") || !url.includes("nido-tests-"))
      throw new Error("Usa test:isolated para esta fixture.");
    client = createClient({ url });
    fixture.db = drizzle(
      async (sql, params, method) => {
        if (capture) {
          queries.push(sql);
          maxParams = Math.max(maxParams, params.length);
        }
        const result = await client.execute({ sql, args: params });
        if (capture) await afterQuery(sql);
        const rows = result.rows.map((row) =>
          Array.from(row as unknown as ArrayLike<unknown>),
        );
        return {
          rows: method === "run" ? [] : method === "get" ? rows[0] : rows,
        };
      },
      { schema },
    );
  });
  beforeEach(async () => {
    clock = AT;
    capture = false;
    afterQuery = () => {};
    queries = [];
    vi.stubEnv("NIDO_PRACTICE_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "fictitious-key");
    vi.stubEnv("CONTACT_FROM_EMAIL", "Nido <fixture@example.test>");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("No red en esta fixture");
      }),
    );
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    await clean();
  });
  afterEach(async () => {
    capture = false;
    await clean();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(() => client.close());

  it("lote vacío informa que terminó sin escrituras", async () => {
    const send = sender();
    const result = await run(send);
    expect(costs()).toEqual({ statements: 2, writes: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ complete: true, enqueued: 0, sent: 0 });
  });
  it("lote saturado acota desde el encolado y declara trabajo restante", async () => {
    await seed(100);
    const send = sender();
    const result = await run(send);
    expect(costs()).toEqual({ statements: 39, writes: 25 });
    expect(result).toMatchObject({
      complete: false,
      exhausted: true,
      enqueued: 100,
      sent: 6,
      statementsReserved: 39,
      writesReserved: 25,
    });
    expect(send).toHaveBeenCalledTimes(6);
    expect(maxParams).toBe(83);
    expect(await fixture.db.select().from(deliveries)).toHaveLength(
      result.enqueued,
    );
  });
  it("el reloj vencido durante enqueue conserva sólo el progreso terminado", async () => {
    await seed(100);
    afterQuery = (sql) => {
      if (sql.includes("INSERT INTO appointment_reminder_deliveries"))
        clock = AT + 35001;
    };
    const send = sender();
    const result = await run(send);
    expect(costs()).toEqual({ statements: 2, writes: 1 });
    expect(result).toMatchObject({
      enqueued: 8,
      complete: false,
      exhausted: true,
    });
    expect(send).not.toHaveBeenCalled();
    expect(await fixture.db.select().from(deliveries)).toHaveLength(8);
  });
  it("reanuda lotes saturados sin duplicar ni perder los cien avisos", async () => {
    await seed(100);
    const seen = new Set<string>();
    const send = vi.fn(async (input: ReminderEmailInput) => {
      expect(seen.has(input.deliveryId)).toBe(false);
      seen.add(input.deliveryId);
      return { ok: true as const };
    });
    let complete = false;
    for (let tick = 0; tick < 20 && !complete; tick++) {
      clock = AT + tick * 300000;
      const result = await run(send);
      expect(costs().statements).toBeLessThanOrEqual(result.statementsReserved);
      expect(costs().writes).toBeLessThanOrEqual(result.writesReserved);
      expect(result.statementsReserved).toBeLessThanOrEqual(40);
      expect(result.writesReserved).toBeLessThanOrEqual(30);
      expect(result.sent).toBeGreaterThan(0);
      complete = result.complete;
    }
    expect(complete).toBe(true);
    expect(send).toHaveBeenCalledTimes(100);
    expect(await fixture.db.select().from(deliveries)).toHaveLength(100);
    expect(
      (await fixture.db.select().from(deliveries)).every(
        (row) => row.status === "sent" && row.attempts === 1,
      ),
    ).toBe(true);
  });
  it("el insert agrupado revalida cada candidato tras cambios de permiso y cita", async () => {
    await seed(8);
    afterQuery = async (sql) => {
      if (!sql.startsWith("SELECT a.id,a.starts_at,pref.user_id")) return;
      await client.batch(
        [
          {
            sql: "UPDATE appointment_reminder_preferences SET email_enabled=0 WHERE user_id=?",
            args: [`${P}000`],
          },
          {
            sql: "UPDATE appointment_reminder_preferences SET revision=2 WHERE user_id=?",
            args: [`${P}001`],
          },
          {
            sql: "UPDATE practice_appointments SET status='cancelled' WHERE id=?",
            args: [`${P}002`],
          },
          {
            sql: "UPDATE practice_appointments SET starts_at=? WHERE id=?",
            args: [iso(AT + 7500000), `${P}003`],
          },
          {
            sql: "UPDATE user SET email_verified=0 WHERE id=?",
            args: [`${P}004`],
          },
          {
            sql: "UPDATE practice_patients SET status='closed' WHERE id=?",
            args: [`${P}005`],
          },
          {
            sql: "UPDATE professionals SET status='pending' WHERE id=?",
            args: [`${P}006`],
          },
        ],
        "write",
      );
    };
    const send = sender();
    expect(await run(send)).toMatchObject({
      enqueued: 1,
      sent: 1,
      complete: true,
    });
    expect(costs()).toEqual({ statements: 7, writes: 3 });
    expect(maxParams).toBe(83);
    expect(send).toHaveBeenCalledOnce();
    expect(
      (await fixture.db.select().from(deliveries)).map(
        (row) => row.appointmentId,
      ),
    ).toEqual([`${P}007`]);
  });
  it("un insert concurrente entre scan y escritura no duplica ni cambia identidad", async () => {
    await seed(1);
    let existingId = "";
    afterQuery = async (sql) => {
      if (!sql.startsWith("SELECT a.id,a.starts_at,pref.user_id")) return;
      capture = false;
      try {
        expect(await enqueueAppointmentReminders(clock)).toBe(1);
        existingId = (await fixture.db.select().from(deliveries))[0].id;
      } finally {
        capture = true;
      }
    };
    const send = vi.fn(async (input: ReminderEmailInput) => {
      expect(input.deliveryId).toBe(existingId);
      return { ok: true as const };
    });
    expect(await run(send)).toMatchObject({
      enqueued: 0,
      sent: 1,
      complete: true,
    });
    expect(costs()).toEqual({ statements: 7, writes: 3 });
    expect(send).toHaveBeenCalledOnce();
    const rows = await fixture.db.select().from(deliveries);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: existingId,
      attempts: 1,
      status: "sent",
    });
  });
  it("retry informa incompleto y reanuda la misma identidad sólo al vencer backoff", async () => {
    await seed(1);
    const retry = vi.fn(async () => ({
      ok: false as const,
      retryable: true,
      code: "network" as const,
    }));
    expect(await run(retry)).toMatchObject({
      retry: 1,
      complete: false,
      exhausted: false,
    });
    expect(costs()).toEqual({ statements: 7, writes: 3 });
    const [original] = await fixture.db.select().from(deliveries);
    expect(original).toMatchObject({
      status: "pending",
      attempts: 1,
      nextAttemptAt: AT + 300000,
    });
    clock = AT + 1;
    const send = sender();
    expect(await run(send)).toMatchObject({ sent: 0, complete: true });
    expect(costs()).toEqual({ statements: 2, writes: 0 });
    expect(send).not.toHaveBeenCalled();
    clock = AT + 300000;
    expect(await run(send)).toMatchObject({
      enqueued: 0,
      sent: 1,
      complete: true,
    });
    expect(costs()).toEqual({ statements: 6, writes: 2 });
    expect(send).toHaveBeenCalledOnce();
    expect((await fixture.db.select().from(deliveries))[0]).toMatchObject({
      id: original.id,
      status: "sent",
      attempts: 2,
    });
  });
  it("cancelar después del scan impide enviar y cierra sólo el aviso reclamado", async () => {
    await seed(1);
    afterQuery = async (sql) => {
      if (
        sql.startsWith('select "id" from "appointment_reminder_deliveries"')
      ) {
        await client.execute({
          sql: "UPDATE practice_appointments SET status='cancelled' WHERE id=?",
          args: [`${P}000`],
        });
      }
    };
    const send = sender();
    expect(await run(send)).toMatchObject({
      enqueued: 1,
      skipped: 1,
      complete: true,
    });
    expect(costs()).toEqual({ statements: 7, writes: 3 });
    expect(send).not.toHaveBeenCalled();
    expect((await fixture.db.select().from(deliveries))[0]).toMatchObject({
      status: "skipped",
      reasonCode: "eligibility_changed",
    });
  });
  it("el deadline tras lookup libera el intento no iniciado sin consumir un retry", async () => {
    await seed(1);
    afterQuery = (sql) => {
      if (sql.startsWith("SELECT u.email FROM appointment_reminder_deliveries"))
        clock = AT + 35000;
    };
    const send = sender();
    expect(await run(send)).toMatchObject({
      enqueued: 1,
      deferred: 1,
      complete: false,
      exhausted: true,
    });
    expect(costs()).toEqual({ statements: 7, writes: 3 });
    expect(send).not.toHaveBeenCalled();
    const [original] = await fixture.db.select().from(deliveries);
    expect(original).toMatchObject({
      status: "pending",
      attempts: 0,
      firstAttemptAt: null,
      leaseUntil: null,
      claimToken: null,
    });
    afterQuery = () => {};
    expect(await run(send)).toMatchObject({
      enqueued: 0,
      sent: 1,
      complete: true,
    });
    expect(costs()).toEqual({ statements: 6, writes: 2 });
    expect((await fixture.db.select().from(deliveries))[0]).toMatchObject({
      id: original.id,
      attempts: 1,
      status: "sent",
    });
  });
  it("aplazar un retry no borra su primer intento ni su backoff", async () => {
    await seed(1);
    await run(async () => ({ ok: false, retryable: true, code: "network" }));
    const [original] = await fixture.db.select().from(deliveries);
    clock = AT + 300000;
    afterQuery = (sql) => {
      if (sql.startsWith("SELECT u.email FROM appointment_reminder_deliveries"))
        clock = AT + 335000;
    };
    const send = sender();
    expect(await run(send)).toMatchObject({
      deferred: 1,
      complete: false,
      exhausted: true,
    });
    expect(costs()).toEqual({ statements: 6, writes: 2 });
    expect(send).not.toHaveBeenCalled();
    expect((await fixture.db.select().from(deliveries))[0]).toMatchObject({
      id: original.id,
      attempts: 1,
      firstAttemptAt: AT,
      nextAttemptAt: AT + 300000,
      reasonCode: "network",
      status: "pending",
      claimToken: null,
    });
  });
  it("la liberación por deadline no pisa un claim recuperado por otro intento", async () => {
    await seed(1);
    let recoveredToken: string | null = null;
    afterQuery = async (sql) => {
      if (
        !sql.startsWith("SELECT u.email FROM appointment_reminder_deliveries")
      )
        return;
      // Otra invocación: sus SQL no pertenecen al presupuesto del job observado.
      capture = false;
      try {
        const [row] = await fixture.db.select().from(deliveries);
        clock = AT + 121000;
        recoveredToken = await claimAppointmentReminder(row.id, clock);
      } finally {
        capture = true;
      }
    };
    const send = sender();
    expect(await run(send)).toMatchObject({
      deferred: 0,
      unclaimed: 1,
      complete: false,
      exhausted: true,
    });
    expect(costs()).toEqual({ statements: 7, writes: 3 });
    expect(recoveredToken).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    expect((await fixture.db.select().from(deliveries))[0]).toMatchObject({
      status: "sending",
      attempts: 2,
      claimToken: recoveredToken,
      leaseUntil: AT + 241000,
      firstAttemptAt: AT,
    });
  });
  it("un lote truncado por limit conserva la señal aunque no agote reservas", async () => {
    await seed(2);
    expect(await run(sender(), 1)).toMatchObject({
      enqueued: 2,
      sent: 1,
      complete: false,
      exhausted: false,
    });
    expect(costs()).toEqual({ statements: 7, writes: 3 });
    expect(await run(sender(), 1)).toMatchObject({
      enqueued: 0,
      sent: 1,
      complete: true,
    });
    expect(costs()).toEqual({ statements: 6, writes: 2 });
  });
  it("un intento agotado se contabiliza sin proveedor y con reserva conservadora", async () => {
    await seed(1);
    await enqueueAppointmentReminders(AT);
    const [row] = await fixture.db.select().from(deliveries);
    await fixture.db
      .update(deliveries)
      .set({ attempts: 4, firstAttemptAt: AT - 3600000 })
      .where(eq(deliveries.id, row.id));
    const send = sender();
    expect(await run(send)).toMatchObject({
      dead: 1,
      complete: false,
      statementsReserved: 6,
      writesReserved: 2,
    });
    expect(costs()).toEqual({ statements: 4, writes: 2 });
    expect(send).not.toHaveBeenCalled();
  });
  it("sin proveedor no consume SQL ni simula una entrega operativa", async () => {
    await seed(1);
    vi.stubEnv("RESEND_API_KEY", "");
    const send = sender();
    expect(await run(send)).toMatchObject({
      unavailable: true,
      complete: true,
      statementsReserved: 0,
      writesReserved: 0,
    });
    expect(costs()).toEqual({ statements: 0, writes: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(await fixture.db.select().from(deliveries)).toHaveLength(0);
  });
  it("un aviso futuro queda encolado sin declarar falta de trabajo debido", async () => {
    await seed(1);
    await fixture.db
      .update(schema.practiceAppointments)
      .set({ startsAt: iso(AT + 9000000) });
    const send = sender();
    expect(await run(send)).toMatchObject({
      enqueued: 1,
      sent: 0,
      complete: true,
      exhausted: false,
    });
    expect(costs()).toEqual({ statements: 3, writes: 1 });
    expect(send).not.toHaveBeenCalled();
    expect((await fixture.db.select().from(deliveries))[0]).toMatchObject({
      status: "pending",
      dueAt: AT + 1800000,
    });
  });
});
