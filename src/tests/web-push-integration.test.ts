import { readFile } from "node:fs/promises";
import { type Client, createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { isValidElement, type ReactNode } from "react";
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
  webPushDeliveries as deliveries,
  webPushSubscriptions as devices,
} from "@/db/push-schema";
import * as schema from "@/db/schema";

const fixture = vi.hoisted(() => ({
  db: undefined as unknown as ReturnType<typeof drizzle<typeof schema>>,
  session: vi.fn(),
}));
vi.mock("@/db", () => ({
  get db() {
    return fixture.db;
  },
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: fixture.session }));

import { DELETE, GET, POST } from "@/app/api/push/route";
import PatientSettings from "@/app/mi/ajustes/page";
import { GET as exportGET } from "@/app/mi/exportar/route";
import ProfessionalSettings from "@/app/pro/ajustes/page";
import ManagementPage from "@/app/pro/avisos/page";
import { AppointmentRemindersPanel } from "@/components/practice/reminder-preferences-panel";
import { PushPreferencesPanel } from "@/components/push/push-preferences-panel";
import { SettingsPanel } from "@/components/workspace/settings-panel";
import { purgeAccount } from "@/lib/account";
import { pushPreferencesSchema } from "@/lib/push/contract";
import { sealPushSubscription } from "@/lib/push/crypto";
import { base64url, pushDigest } from "@/lib/push/encoding";
import {
  enqueueWebPush,
  PUSH_JOB_LIMITS,
  runWebPushJobs,
} from "@/lib/push/jobs";
import { type PushActor, subscribePush } from "@/lib/push/preferences";

type PatientPushExport = {
  account: { userId: string };
  reminderPreferences: unknown;
  conversations: unknown[];
  pushPreferences: Array<{
    id: string;
    revision: number;
    preferences: unknown;
  }>;
  pushDeliveries: Array<{
    id: string;
    deviceId: string;
    status: string;
    kind: string;
  }>;
};

let client: Client;
let queries: Array<{ sql: string; params: unknown[] }> = [];
let batches: number[] = [];
let preserved = false;
const AT = Date.now();
const iso = (n: number) => new Date(n).toISOString();
const professional = {
  userId: "push-own-pro",
  sessionId: "push-own-pro-session",
  role: "professional" as const,
};
const patient = {
  userId: "push-own-patient",
  sessionId: "push-own-patient-session",
  role: "patient" as const,
};
const preferences = pushPreferencesSchema.parse({
  chatEnabled: true,
  appointmentEnabled: true,
  quietEnabled: false,
  timeZone: "UTC",
  offsetMinutes: 60,
  quietStart: 1320,
  quietEnd: 480,
});
let subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
let publicKey: string, privateKey: string;
const map = (
  result: Awaited<ReturnType<Client["execute"]>>,
  method: string,
) => {
  const rows = result.rows.map((row) =>
    Array.from(row as unknown as ArrayLike<unknown>),
  );
  return { rows: method === "run" ? [] : method === "get" ? rows[0] : rows };
};
const auth = (actor: PushActor = professional) =>
  fixture.session.mockResolvedValue({
    user: {
      id: actor.userId,
      name: "Persona ficticia",
      email: `${actor.userId}@example.invalid`,
      emailVerified: true,
    },
    session: { id: actor.sessionId },
  });
const request = (
  method: string,
  role = "professional",
  body?: unknown,
  manage = false,
) =>
  new Request(
    `https://nido.example.invalid/api/push?role=${role}${manage ? "&manage=revoke" : ""}`,
    {
      method,
      headers: {
        Origin: "https://nido.example.invalid",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
async function seed() {
  for (const actor of [professional, patient]) {
    await fixture.db.insert(schema.user).values({
      id: actor.userId,
      name: "Persona ficticia",
      email: `${actor.userId}@example.invalid`,
      emailVerified: true,
    });
    await fixture.db.insert(schema.session).values({
      id: actor.sessionId,
      userId: actor.userId,
      token: actor.sessionId,
      expiresAt: new Date(AT + 86400000),
    });
  }
  await fixture.db.insert(schema.professionals).values({
    id: "own-pro",
    userId: professional.userId,
    fullName: "Profesional ficticio",
    email: "pro@example.invalid",
    languages: '["es"]',
    supportAreas: "[]",
    status: "approved",
    country: "VE",
    createdAt: iso(AT),
    updatedAt: iso(AT),
  });
  await fixture.db.insert(schema.patientAccounts).values({
    userId: patient.userId,
    displayName: "Paciente ficticio",
    onboardingCompletedAt: iso(AT),
    createdAt: iso(AT),
    updatedAt: iso(AT),
  });
}
async function insertDevice(
  actor: PushActor = professional,
  id: string = crypto.randomUUID(),
  revokedAt: number | null = null,
) {
  await fixture.db.insert(devices).values({
    id,
    userId: actor.userId,
    role: actor.role,
    sessionId: actor.sessionId,
    endpointHash: `endpoint-secret-${id}`,
    sealedSubscription: "ciphertext-secret-never-export",
    vapidKeyHash: await pushDigest(publicKey),
    preferencesJson: JSON.stringify(preferences),
    revision: 1,
    consentAt: AT - 10000,
    createdAt: AT,
    updatedAt: AT - 1000,
    revokedAt,
  });
  return id;
}
async function insertDelivery(
  id: string,
  index = 0,
  expiresAt = AT + 86400000,
) {
  await fixture.db.insert(deliveries).values({
    id: crypto.randomUUID(),
    subscriptionId: id,
    eventHash: `hash-${index}`,
    kind: "chat",
    entityId: `private-entity-${index}`,
    eventVersion: "private-event-version",
    preferenceRevision: 1,
    dueAt: AT,
    expiresAt,
    status: "pending",
    attempts: 0,
    nextAttemptAt: AT,
    createdAt: AT,
    updatedAt: AT,
  });
}
// Keep real crypto for sealed fixtures; only delivery IDs control equal-time order.
async function seedLargeBacklog() {
  for (let i = 0; i < 50; i++)
    await insertDevice(
      professional,
      `fixture-device-${String(i).padStart(2, "0")}`,
    );
  for (let i = 0; i < 30; i++)
    await fixture.db.insert(schema.conversations).values({
      id: `fixture-chat-${i}`,
      professionalId: "own-pro",
      seekerSid: "fictitious",
      status: "open",
      lastMessageAt: new Date(AT - 1),
      lastMessageRole: "seeker",
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
  for (const row of await fixture.db.select().from(devices)) {
    await fixture.db
      .update(devices)
      .set({
        sealedSubscription: await sealPushSubscription(
          JSON.stringify(subscription),
          row.userId,
          row.role,
          row.id,
        ),
      })
      .where(eq(devices.id, row.id));
  }
}
async function runOrderedBacklog(sameDeviceFirst: boolean) {
  const send = vi.fn(async () => ({
    ok: false as const,
    code: "expired" as const,
    retryable: false,
  }));
  const uuid = vi.spyOn(crypto, "randomUUID");
  // Enqueue visits each device's two events consecutively. With equal due times,
  // queue order is by UUID, so alternate devices for the original two-send case.
  for (let i = 0; i < 10; i++) {
    const rank = sameDeviceFirst ? i : (i % 2) * 5 + Math.floor(i / 2);
    uuid.mockReturnValueOnce(
      `00000000-0000-4000-8000-${String(rank).padStart(12, "0")}`,
    );
  }
  try {
    const result = await runWebPushJobs(AT, send, () => AT);
    return { result, send };
  } finally {
    // Claim tokens and every subsequent test retain the real UUID generator.
    uuid.mockRestore();
  }
}
beforeAll(async () => {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("file:") || !url.includes("nido-tests-"))
    throw new Error("Use test:isolated; no local or production DB allowed");
  const baseline = createClient({ url });
  const ddl = await baseline.execute(
    "SELECT type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'web_push_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END",
  );
  baseline.close();
  client = createClient({ url: "file::memory:" });
  await client.execute("PRAGMA foreign_keys=OFF");
  for (const row of ddl.rows) await client.execute(String(row.sql));
  fixture.db = drizzle(
    async (query, params, method) => {
      queries.push({ sql: query, params });
      return map(
        await client.execute({ sql: query, args: params as never[] }),
        method,
      );
    },
    async (batch) => {
      batches.push(batch.length);
      queries.push(
        ...batch.map((query) => ({ sql: query.sql, params: query.params })),
      );
      const results = await client.batch(
        batch.map((query) => ({
          sql: query.sql,
          args: query.params as never[],
        })),
        "write",
      );
      return results.map((result, index) => map(result, batch[index].method));
    },
    { schema },
  );
  await seed();
  const snapshot = async () =>
    Promise.all(
      ["user", "session", "professionals", "patient_accounts"].map(
        async (name) =>
          (await client.execute(`SELECT * FROM ${name} ORDER BY 1`)).rows.map(
            (row) => Array.from(row as unknown as ArrayLike<unknown>),
          ),
      ),
    );
  const before = await snapshot();
  const original = await readFile(
    new URL("../../drizzle/0039_web_push.sql", import.meta.url),
    "utf8",
  );
  for (const statement of original.split("--> statement-breakpoint"))
    await client.execute(statement);
  preserved = JSON.stringify(before) === JSON.stringify(await snapshot());
  const vapid = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  publicKey = base64url(
    new Uint8Array(await crypto.subtle.exportKey("raw", vapid.publicKey)),
  );
  privateKey = (await crypto.subtle.exportKey("jwk", vapid.privateKey)).d || "";
  const receiver = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/integration-fictitious",
    keys: {
      p256dh: base64url(
        new Uint8Array(
          await crypto.subtle.exportKey("raw", receiver.publicKey),
        ),
      ),
      auth: base64url(crypto.getRandomValues(new Uint8Array(16))),
    },
  };
});
beforeEach(async () => {
  await client.execute("DROP TRIGGER IF EXISTS fixture_push_session_order");
  await client.execute("DROP TRIGGER IF EXISTS fixture_push_user_order");
  await client.execute("DROP TRIGGER IF EXISTS fixture_fail_user_delete");
  for (const table of [
    deliveries,
    devices,
    schema.conversations,
    schema.patientAccounts,
    schema.professionals,
    schema.session,
    schema.user,
  ])
    await fixture.db.delete(table);
  await seed();
  auth();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Real network blocked");
    }),
  );
  vi.stubEnv("NIDO_PUSH_ENABLED", "true");
  vi.stubEnv("NIDO_PUSH_ENCRYPTION_KEY", "71".repeat(32));
  vi.stubEnv("NIDO_PUSH_VAPID_PUBLIC_KEY", publicKey);
  vi.stubEnv("NIDO_PUSH_VAPID_PRIVATE_KEY", privateKey);
  vi.stubEnv("NIDO_PUSH_VAPID_SUBJECT", "mailto:fixture@example.invalid");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  queries = [];
  batches = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => client.close());

function elements(
  node: ReactNode,
): Array<{ type: unknown; props: Record<string, unknown> }> {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (
    !isValidElement<{
      children?: ReactNode;
      sections?: Array<{ content: ReactNode }>;
    }>(node)
  )
    return [];
  return [
    { type: node.type, props: node.props },
    ...elements(node.props.children),
    ...(node.props.sections || []).flatMap((section) =>
      elements(section.content),
    ),
  ];
}
describe("Push integration in an independent memory database", () => {
  it("renders both actual protected settings pages with independent email and Push panels under Avisos", async () => {
    const professionalPage = await ProfessionalSettings({
      searchParams: Promise.resolve({}),
    });
    auth(patient);
    const patientPage = await PatientSettings({
      searchParams: Promise.resolve({}),
    });
    for (const [node, audience] of [
      [professionalPage, "professional"],
      [patientPage, "patient"],
    ] as const) {
      const tree = elements(node);
      const settings = tree.find((element) => element.type === SettingsPanel);
      expect(settings).toBeDefined();
      const sections = settings?.props.sections as Array<{
        label: string;
        content: ReactNode;
      }>;
      const avisos = sections.find((section) => section.label === "Avisos");
      expect(avisos).toBeDefined();
      const controls = elements(avisos?.content);
      expect(
        controls.find((element) => element.type === PushPreferencesPanel)?.props
          .audience,
      ).toBe(audience);
      expect(
        controls.some((element) => element.type === AppointmentRemindersPanel),
      ).toBe(true);
    }
  });

  it("applies the complete original 0039 after seeded legacy rows without data changes or opt-ins", async () => {
    expect(preserved).toBe(true);
    expect(await fixture.db.select().from(devices)).toHaveLength(0);
    expect(await fixture.db.select().from(deliveries)).toHaveLength(0);
  });
  it("exports the actual patient route, legacy fields and minimal own consents/statuses", async () => {
    const own = await insertDevice(patient);
    await insertDelivery(own);
    await insertDevice();
    auth(patient);
    const result = await exportGET();
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    const json = (await result.json()) as PatientPushExport;
    expect(json.account.userId).toBe(patient.userId);
    expect(json.reminderPreferences).toBeNull();
    expect(json.conversations).toEqual([]);
    expect(json.pushPreferences).toHaveLength(1);
    expect(json.pushPreferences[0]).toMatchObject({
      id: own,
      revision: 1,
      preferences,
    });
    expect(json.pushDeliveries[0]).toMatchObject({
      deviceId: own,
      status: "pending",
      kind: "chat",
    });
    expect(JSON.stringify(json)).not.toMatch(
      /endpoint-secret|ciphertext-secret|private-entity|private-event-version|vapidKeyHash|sessionId|sealedSubscription|p256dh/,
    );
  });
  it("pages the Push export over more than 100 delivery rows without duplicates", async () => {
    const own = await insertDevice(patient);
    for (let i = 0; i < 101; i++) await insertDelivery(own, i);
    auth(patient);
    const json = (await (await exportGET()).json()) as PatientPushExport;
    expect(json.pushDeliveries).toHaveLength(101);
    expect(
      new Set(json.pushDeliveries.map((row: { id: string }) => row.id)).size,
    ).toBe(101);
  });
  it("export denies a professional session without a patient account", async () => {
    expect((await exportGET()).status).toBe(403);
  });
  it("export denies stale or unverified sessions", async () => {
    auth(patient);
    await fixture.db
      .update(schema.session)
      .set({ expiresAt: new Date(AT - 1) });
    expect((await exportGET()).status).toBe(403);
    fixture.session.mockResolvedValue({
      user: { id: patient.userId, emailVerified: false },
      session: { id: patient.sessionId },
    });
    expect((await exportGET()).status).toBe(401);
  });
  it.each([
    professional,
    patient,
  ])("purges $role Push children before sessions/users with foreign keys OFF", async (actor) => {
    const own = await insertDevice(actor);
    await insertDelivery(own);
    const other = await insertDevice(
      actor === professional ? patient : professional,
    );
    await client.execute(
      "CREATE TRIGGER fixture_push_session_order BEFORE DELETE ON session WHEN EXISTS(SELECT 1 FROM web_push_subscriptions w WHERE w.session_id=OLD.id) BEGIN SELECT RAISE(ABORT,'push before session'); END",
    );
    await client.execute(
      "CREATE TRIGGER fixture_push_user_order BEFORE DELETE ON user WHEN EXISTS(SELECT 1 FROM web_push_subscriptions w WHERE w.user_id=OLD.id) BEGIN SELECT RAISE(ABORT,'push before user'); END",
    );
    await purgeAccount(actor.userId, {
      kind: "self",
      userId: actor.userId,
      email: `${actor.userId}@example.invalid`,
      sessionId: actor.sessionId,
    });
    expect(await fixture.db.select().from(deliveries)).toHaveLength(0);
    expect(
      (await fixture.db.select().from(devices)).map((row) => row.id),
    ).toEqual([other]);
    expect(
      await fixture.db
        .select()
        .from(schema.session)
        .where(eq(schema.session.userId, actor.userId)),
    ).toHaveLength(0);
    expect(
      await fixture.db
        .select()
        .from(schema.user)
        .where(eq(schema.user.id, actor.userId)),
    ).toHaveLength(0);
  });
  it("a failure in the existing final account batch rolls back Push deletion", async () => {
    const own = await insertDevice();
    await insertDelivery(own);
    await client.execute(
      "CREATE TRIGGER fixture_fail_user_delete BEFORE DELETE ON user BEGIN SELECT RAISE(ABORT,'fixture rollback'); END",
    );
    await expect(
      purgeAccount(professional.userId, {
        kind: "self",
        userId: professional.userId,
        email: `${professional.userId}@example.invalid`,
        sessionId: professional.sessionId,
      }),
    ).rejects.toThrow();
    expect(await fixture.db.select().from(devices)).toHaveLength(1);
    expect(await fixture.db.select().from(deliveries)).toHaveLength(1);
    expect(
      await fixture.db
        .select()
        .from(schema.session)
        .where(eq(schema.session.userId, professional.userId)),
    ).toHaveLength(1);
  });
  it.each([
    "pending",
    "suspended",
  ])("%s professional can view the real revocation page and retire own devices only", async (status) => {
    const own = await insertDevice();
    const other = await insertDevice(patient);
    await fixture.db
      .update(schema.professionals)
      .set({ status: status as "pending" });
    expect((await GET(request("GET"))).status).toBe(403);
    expect(await ManagementPage({})).toBeTruthy();
    const result = await GET(request("GET", "professional", undefined, true));
    expect(await result.json()).toEqual({
      devices: [{ id: own, revokedAt: null }],
    });
    expect(
      (
        await POST(
          request("POST", "professional", {
            subscription,
            preferences,
            revision: 0,
          }),
        )
      ).status,
    ).toBe(403);
    vi.stubEnv("NIDO_PUSH_ENABLED", "false");
    expect(
      (await DELETE(request("DELETE", "professional", { all: true }))).status,
    ).toBe(200);
    const rows = await fixture.db.select().from(devices);
    expect(rows.find((row) => row.id === own)?.sealedSubscription).toBeNull();
    expect(rows.find((row) => row.id === other)?.sealedSubscription).toBe(
      "ciphertext-secret-never-export",
    );
  });
  it("revocation management denies wrong role, expired sessions and freshly unverified accounts", async () => {
    auth(patient);
    expect(
      (await GET(request("GET", "professional", undefined, true))).status,
    ).toBe(403);
    expect(
      (await DELETE(request("DELETE", "professional", { all: true }))).status,
    ).toBe(401);
    auth();
    await fixture.db
      .update(schema.session)
      .set({ expiresAt: new Date(AT - 1) });
    expect(
      (await GET(request("GET", "professional", undefined, true))).status,
    ).toBe(403);
    expect(
      (await DELETE(request("DELETE", "professional", { all: true }))).status,
    ).toBe(401);
    await fixture.db
      .update(schema.session)
      .set({ expiresAt: new Date(AT + 86400000) });
    await fixture.db.update(schema.user).set({ emailVerified: false });
    expect(
      (await DELETE(request("DELETE", "professional", { all: true }))).status,
    ).toBe(401);
  });
  it("account transition requires a new local endpoint; preserves the original owner", async () => {
    await subscribePush(professional, subscription, preferences, 0, AT);
    const original = await fixture.db.select().from(devices);
    await expect(
      subscribePush(patient, subscription, preferences, 0, AT),
    ).rejects.toThrow("push_conflict");
    await subscribePush(
      patient,
      { ...subscription, endpoint: `${subscription.endpoint}-new-local` },
      preferences,
      0,
      AT,
    );
    expect(
      await fixture.db
        .select()
        .from(devices)
        .where(eq(devices.userId, professional.userId)),
    ).toEqual(original);
  });
  it("role transition on the same account cannot reassign an endpoint", async () => {
    await fixture.db.insert(schema.patientAccounts).values({
      userId: professional.userId,
      displayName: "Ficticio",
      onboardingCompletedAt: iso(AT),
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
    await subscribePush(professional, subscription, preferences, 0, AT);
    const original = await fixture.db.select().from(devices);
    const otherRole = { ...professional, role: "patient" as const };
    await expect(
      subscribePush(otherRole, subscription, preferences, 0, AT),
    ).rejects.toThrow("push_conflict");
    await subscribePush(
      otherRole,
      { ...subscription, endpoint: `${subscription.endpoint}-patient` },
      preferences,
      0,
      AT,
    );
    expect(
      await fixture.db
        .select()
        .from(devices)
        .where(eq(devices.role, "professional")),
    ).toEqual(original);
  });
  it("large backlog is bounded before enqueue, rotates devices fairly, never reports successful exhaustion", async () => {
    await seedLargeBacklog();
    queries = [];
    batches = [];
    const { result, send } = await runOrderedBacklog(false);
    expect(result).toMatchObject({
      enqueued: 10,
      complete: false,
      exhausted: true,
    });
    expect(result.failed).toBeGreaterThan(0);
    expect(queries.length).toBeLessThanOrEqual(PUSH_JOB_LIMITS.statements);
    expect(
      queries.filter((q) => /^(insert|update|delete)/i.test(q.sql)).length,
    ).toBeLessThanOrEqual(PUSH_JOB_LIMITS.writes);
    expect(queries.every((q) => q.params.length <= 100)).toBe(true);
    expect(Math.max(...batches)).toBeLessThanOrEqual(PUSH_JOB_LIMITS.batch);
    const first = await fixture.db
      .select({ id: deliveries.subscriptionId })
      .from(deliveries);
    await enqueueWebPush(AT + 1);
    const second = await fixture.db
      .select({ id: deliveries.subscriptionId })
      .from(deliveries);
    expect(new Set(first.map((row) => row.id)).size).toBe(5);
    expect(new Set(second.map((row) => row.id)).size).toBe(10);
    expect(send).toHaveBeenCalledTimes(2); // Six SQL statements and three writes per simulated 410, never a real provider.
    expect(result).toMatchObject({ processed: 2, dead: 2, skipped: 0 });
    const attempted = await fixture.db
      .select({ subscriptionId: deliveries.subscriptionId })
      .from(deliveries)
      .where(eq(deliveries.status, "dead"));
    expect(new Set(attempted.map((row) => row.subscriptionId)).size).toBe(2);
  });
  it("large backlog skips a second equal-time event after its device returns 410", async () => {
    await seedLargeBacklog();
    queries = [];
    batches = [];
    const { result, send } = await runOrderedBacklog(true);
    expect(result).toMatchObject({
      enqueued: 10,
      processed: 2,
      dead: 1,
      skipped: 1,
      complete: false,
      exhausted: true,
      statementsReserved: 39,
      writesReserved: 26,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(queries.length).toBeLessThanOrEqual(PUSH_JOB_LIMITS.statements);
    const stopped = await fixture.db
      .select()
      .from(deliveries)
      .where(eq(deliveries.subscriptionId, "fixture-device-00"));
    expect(stopped.map((row) => row.status).sort()).toEqual([
      "dead",
      "skipped",
    ]);
    expect(stopped.map((row) => row.reasonCode).sort()).toEqual([
      "consent_changed",
      "expired",
    ]);
    const [retired] = await fixture.db
      .select()
      .from(devices)
      .where(eq(devices.id, "fixture-device-00"));
    expect(retired).toMatchObject({
      revokedAt: AT,
      sealedSubscription: null,
      sessionId: null,
      revision: 2,
    });
  });
  it("elapsed budget covers configuration and maintenance before any enqueue or send", async () => {
    await insertDevice();
    queries = [];
    batches = [];
    let clock = 0;
    const send = vi.fn(async () => ({ ok: true as const }));
    const result = await runWebPushJobs(
      AT,
      send,
      () => AT + clock++ * PUSH_JOB_LIMITS.milliseconds,
    );
    expect(result).toMatchObject({
      complete: false,
      exhausted: true,
      enqueued: 0,
      failed: 1,
    });
    expect(queries).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });
  it("stops midway through enqueue and preserves the exact verified partial progress", async () => {
    for (let i = 0; i < 5; i++)
      await insertDevice(professional, `partial-device-${i}`);
    for (let i = 0; i < 3; i++)
      await fixture.db.insert(schema.conversations).values({
        id: `partial-chat-${i}`,
        professionalId: "own-pro",
        seekerSid: "fictitious",
        status: "open",
        lastMessageAt: new Date(AT - 1),
        lastMessageRole: "seeker",
        createdAt: iso(AT),
        updatedAt: iso(AT),
      });
    queries = [];
    batches = [];
    let ticks = 0;
    const send = vi.fn(async () => ({ ok: true as const }));
    const result = await runWebPushJobs(AT, send, () =>
      ticks++ < 6 ? AT : AT + PUSH_JOB_LIMITS.milliseconds,
    );
    expect(result).toMatchObject({
      enqueued: 2,
      processed: 0,
      complete: false,
      exhausted: true,
    });
    expect(await fixture.db.select().from(deliveries)).toHaveLength(2);
    expect(send).not.toHaveBeenCalled();
  });
  it("maintenance removes at most 50 children and retains a retired parent with remaining children", async () => {
    const retired = await insertDevice(
      professional,
      crypto.randomUUID(),
      AT - 31 * 86400000,
    );
    for (let i = 0; i < 121; i++)
      await insertDelivery(retired, i, AT - 31 * 86400000);
    await runWebPushJobs(
      AT,
      vi.fn(async () => ({ ok: true as const })),
      () => AT,
    );
    expect(await fixture.db.select().from(deliveries)).toHaveLength(21);
    expect(await fixture.db.select().from(devices)).toHaveLength(1);
  });
});
