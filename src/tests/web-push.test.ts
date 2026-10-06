import { readFile } from "node:fs/promises";
import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
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

const authFixture = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: authFixture.getSession,
}));

import { DELETE, GET, PATCH, POST } from "@/app/api/push/route";
import { practiceNotes } from "@/db/notes-schema";
import {
  webPushDeliveries as deliveries,
  webPushSubscriptions as subscriptions,
} from "@/db/push-schema";
import {
  conversations,
  patientAccounts,
  patientConversationLinks,
  practiceAppointments,
  practicePatients,
  professionals,
  session,
  user,
} from "@/db/schema";
import type { PushPreferences } from "@/lib/push/contract";
import { openPushSubscription } from "@/lib/push/crypto";
import { base64url } from "@/lib/push/encoding";
import {
  deliverWebPush,
  enqueueWebPush,
  pushOpenDestination,
  runWebPushJobs,
} from "@/lib/push/jobs";
import type { PushActor } from "@/lib/push/preferences";
import {
  purgePushForAccount,
  pushConfiguration,
  revokePush,
  subscribePush,
  updatePushPreferences,
} from "@/lib/push/preferences";

const AT = Date.parse("2026-10-04T12:00:00Z");
const iso = (at: number) => new Date(at).toISOString();
const pro = {
  userId: "fixture-push-pro",
  sessionId: "fixture-push-pro-session",
  role: "professional" as const,
};
const patient = {
  userId: "fixture-push-patient",
  sessionId: "fixture-push-patient-session",
  role: "patient" as const,
};
const preferences: PushPreferences = {
  chatEnabled: true,
  appointmentEnabled: true,
  afterSessionEnabled: false,
  offsetMinutes: 60,
  timeZone: "UTC",
  quietEnabled: false,
  quietStart: 1320,
  quietEnd: 480,
};
let subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
const sender = () => vi.fn(async () => ({ ok: true as const }));
const deliver = (id: string, send = sender(), at = AT) =>
  deliverWebPush(id, at, send, () => at);
async function optIn(actor: PushActor = pro, prefs = preferences) {
  return subscribePush(actor, subscription, prefs, 0, AT - 3600000);
}
async function queue(actor: PushActor = pro, prefs = preferences) {
  await optIn(actor, prefs);
  await enqueueWebPush(AT);
  return db.select().from(deliveries);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL?.includes("nido-tests-"))
    throw new Error("requires isolated fixture database");
  const client = createClient({ url: process.env.DATABASE_URL });
  const migration = await readFile(
    new URL("../../drizzle/0039_web_push.sql", import.meta.url),
    "utf8",
  );
  const existing = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('web_push_subscriptions','web_push_deliveries')",
  );
  if (existing.rows.length === 1)
    throw new Error("Incomplete Push fixture schema");
  if (!existing.rows.length) {
    for (const statement of migration.split("--> statement-breakpoint"))
      await client.execute(statement);
  }
  client.close();
  const receiver = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/fictitious-fixture",
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AT);
  authFixture.getSession.mockResolvedValue({
    user: { id: pro.userId, emailVerified: true },
    session: { id: pro.sessionId },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("No network in fixtures");
    }),
  );
  vi.stubEnv("NIDO_PUSH_ENABLED", "true");
  vi.stubEnv("NIDO_PUSH_ENCRYPTION_KEY", "12".repeat(32));
  vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "34".repeat(32));
  const signer = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  vi.stubEnv(
    "NIDO_PUSH_VAPID_PUBLIC_KEY",
    base64url(
      new Uint8Array(await crypto.subtle.exportKey("raw", signer.publicKey)),
    ),
  );
  vi.stubEnv(
    "NIDO_PUSH_VAPID_PRIVATE_KEY",
    (await crypto.subtle.exportKey("jwk", signer.privateKey)).d || "",
  );
  vi.stubEnv("NIDO_PUSH_VAPID_SUBJECT", "mailto:fixture@example.invalid");
  for (const table of [
    deliveries,
    subscriptions,
    practiceNotes,
    practiceAppointments,
    practicePatients,
    patientConversationLinks,
    conversations,
    patientAccounts,
    professionals,
    session,
    user,
  ])
    await db.delete(table);
  await db.insert(user).values(
    [pro, patient].map((actor) => ({
      id: actor.userId,
      name: "Persona ficticia",
      email: `${actor.userId}@example.invalid`,
      emailVerified: true,
    })),
  );
  await db.insert(session).values(
    [pro, patient].map((actor) => ({
      id: actor.sessionId,
      userId: actor.userId,
      token: `${actor.sessionId}-token`,
      expiresAt: new Date(AT + 86400000),
    })),
  );
  await db.insert(professionals).values({
    id: "fixture-push-professional",
    userId: pro.userId,
    email: "pro@example.invalid",
    fullName: "Profesional ficticio",
    languages: '["es"]',
    supportAreas: "[]",
    status: "approved",
    country: "VE",
    maxActiveRequests: 5,
    createdAt: iso(AT),
    updatedAt: iso(AT),
  });
  await db.insert(patientAccounts).values({
    userId: patient.userId,
    displayName: "Paciente ficticio",
    onboardingCompletedAt: iso(AT),
    createdAt: iso(AT),
    updatedAt: iso(AT),
  });
  await db.insert(conversations).values({
    id: "fixture-push-chat",
    professionalId: "fixture-push-professional",
    seekerSid: "fixture",
    status: "open",
    lastMessageAt: new Date(AT - 1000),
    lastMessageRole: "seeker",
    createdAt: iso(AT),
    updatedAt: iso(AT),
  });
  await db.insert(patientConversationLinks).values({
    conversationId: "fixture-push-chat",
    userId: patient.userId,
    verifiedBy: "verified_email",
    verifiedAt: iso(AT),
  });
  await db.insert(practicePatients).values({
    id: "fixture-push-practice-patient",
    professionalId: "fixture-push-professional",
    conversationId: "fixture-push-chat",
    name: "Paciente ficticio",
    country: "VE",
    status: "active",
    consentAt: iso(AT),
    createdAt: iso(AT),
    updatedAt: iso(AT),
  });
  await db.insert(practiceAppointments).values({
    id: "fixture-push-appointment",
    professionalId: "fixture-push-professional",
    patientId: "fixture-push-practice-patient",
    startsAt: iso(AT + 1800000),
    endsAt: iso(AT + 5400000),
    timeZone: "UTC",
    createdAt: iso(AT),
    updatedAt: iso(AT),
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  for (const table of [
    deliveries,
    subscriptions,
    practiceNotes,
    practiceAppointments,
    practicePatients,
    patientConversationLinks,
    conversations,
    patientAccounts,
    professionals,
    session,
    user,
  ])
    await db.delete(table);
});

describe("Web Push aislado: permisos y cola", () => {
  it("recorre API, almacenamiento, cola, guardado y baja con sesión ficticia", async () => {
    const request = (method: string, body?: unknown) =>
      new Request("https://nido.example.invalid/api/push?role=professional", {
        method,
        headers: {
          Origin: "https://nido.example.invalid",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    const activated = await POST(
      request("POST", { subscription, preferences, revision: 0 }),
    );
    expect(activated.status).toBe(200);
    const { id, revision } = (await activated.json()) as {
      id: string;
      revision: number;
    };
    const response = await GET(request("GET"));
    const result = (await response.json()) as {
      available: boolean;
      devices: Array<{ active: boolean }>;
    };
    expect(result.available).toBe(true);
    expect(result.devices[0].active).toBe(true);
    expect(JSON.stringify(result)).not.toContain(subscription.endpoint);
    const at = Date.now() + 1000;
    await db.update(conversations).set({ lastMessageAt: new Date(at) });
    await enqueueWebPush(at);
    const [row] = await db.select().from(deliveries);
    expect(row.kind).toBe("chat");
    const send = sender();
    expect(await deliver(row.id, send, at)).toBe("sent");
    expect(
      (
        await PATCH(
          request("PATCH", {
            id,
            revision,
            preferences: { ...preferences, chatEnabled: false },
          }),
        )
      ).status,
    ).toBe(200);
    vi.stubEnv("NIDO_PUSH_ENABLED", "false");
    expect((await DELETE(request("DELETE", { id }))).status).toBe(200);
    expect(
      (await db.select().from(subscriptions))[0].sealedSubscription,
    ).toBeNull();
  });
  it("purga explícita de cuenta borra sólo sus dispositivos y ledgers", async () => {
    await queue();
    await purgePushForAccount(patient.userId);
    expect(await db.select().from(subscriptions)).toHaveLength(1);
    await purgePushForAccount(pro.userId);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
    expect(await db.select().from(deliveries)).toHaveLength(0);
    expect(await db.select().from(user)).toHaveLength(2);
  });
  it("sin opt-in no crea filas ni avisos", async () => {
    expect(await enqueueWebPush(AT)).toBe(0);
    expect(await db.select().from(subscriptions)).toHaveLength(0);
  });
  it("guarda cifrado con dueño y rol autenticados", async () => {
    const result = await optIn();
    const [row] = await db.select().from(subscriptions);
    expect(row.sealedSubscription).not.toContain(subscription.endpoint);
    expect(
      JSON.parse(
        await openPushSubscription(
          row.sealedSubscription || "",
          pro.userId,
          pro.role,
          result.id,
        ),
      ),
    ).toEqual(subscription);
    await expect(
      openPushSubscription(
        row.sealedSubscription || "",
        patient.userId,
        pro.role,
        result.id,
      ),
    ).rejects.toThrow();
  });
  it("CAS rechaza una ventana antigua y no cambia el consentimiento", async () => {
    const { id } = await optIn();
    await updatePushPreferences(
      pro,
      id,
      1,
      { ...preferences, chatEnabled: false },
      AT,
    );
    await expect(
      subscribePush(pro, subscription, preferences, 1, AT + 1000),
    ).rejects.toThrow("push_conflict");
    expect((await db.select().from(subscriptions))[0].revision).toBe(2);
  });
  it("un endpoint no puede cambiar de cuenta", async () => {
    await optIn();
    await expect(
      subscribePush(patient, subscription, preferences, 1, AT),
    ).rejects.toThrow("push_conflict");
  });
  it("rechaza cuentas sin correo verificado en la escritura", async () => {
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, pro.userId));
    await expect(optIn()).rejects.toThrow("push_conflict");
  });
  it("no activa si el proveedor no está configurado", async () => {
    vi.stubEnv("NIDO_PUSH_ENABLED", "false");
    expect(await pushConfiguration()).toBeNull();
    await expect(optIn()).rejects.toThrow("push_unavailable");
  });
  it("deduplica chat y agenda por dispositivo y evento", async () => {
    const rows = await queue();
    expect(rows.map((row) => row.kind).sort()).toEqual(["appointment", "chat"]);
    expect(await enqueueWebPush(AT)).toBe(0);
    const send = sender();
    for (const row of rows) expect(await deliver(row.id, send)).toBe("sent");
    for (const row of rows)
      expect(await deliver(row.id, send)).toBe("unclaimed");
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls)).not.toContain("Paciente ficticio");
    expect(JSON.stringify(send.mock.calls)).not.toContain("fixture-push-chat");
  });
  it("sólo una reclamación concurrente envía", async () => {
    const [row] = await queue();
    const send = sender();
    await Promise.all([deliver(row.id, send), deliver(row.id, send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("la baja funciona sin proveedor y elimina el secreto", async () => {
    const rows = await queue();
    vi.stubEnv("NIDO_PUSH_ENABLED", "false");
    await revokePush(pro);
    const [row] = await db.select().from(subscriptions);
    expect(row.sealedSubscription).toBeNull();
    expect(row.sessionId).toBeNull();
    expect(
      (await db.select().from(deliveries)).every(
        (row) => row.status === "skipped",
      ),
    ).toBe(true);
    vi.stubEnv("NIDO_PUSH_ENABLED", "true");
    const send = sender();
    await deliver(rows[0].id, send);
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    "read",
    "close",
    "delete",
    "anonymize",
    "unverify",
    "suspend",
    "logout",
    "change_session",
  ])("revalida el chat tras cambio %s", async (change) => {
    const rows = await queue();
    const row = rows.find((row) => row.kind === "chat");
    expect(row).toBeDefined();
    if (change === "read")
      await db.update(conversations).set({ proLastReadAt: new Date(AT) });
    if (change === "close")
      await db.update(conversations).set({ status: "closed" });
    if (change === "delete")
      await db.update(conversations).set({ deletedAt: new Date(AT) });
    if (change === "anonymize")
      await db.update(conversations).set({ anonymizedAt: iso(AT) });
    if (change === "unverify")
      await db
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, pro.userId));
    if (change === "suspend")
      await db.update(professionals).set({ status: "pending" });
    if (change === "logout")
      await db.delete(session).where(eq(session.id, pro.sessionId));
    if (change === "change_session")
      await db
        .update(session)
        .set({ expiresAt: new Date(AT - 1) })
        .where(eq(session.id, pro.sessionId));
    const send = sender();
    expect(await deliver(row?.id || "", send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    "cancel",
    "move",
    "close_patient",
  ])("revalida agenda %s", async (change) => {
    const rows = await queue();
    const row = rows.find((row) => row.kind === "appointment");
    if (change === "cancel")
      await db.update(practiceAppointments).set({ status: "cancelled" });
    if (change === "move")
      await db
        .update(practiceAppointments)
        .set({ startsAt: iso(AT + 7200000), endsAt: iso(AT + 10800000) });
    if (change === "close_patient")
      await db.update(practicePatients).set({ status: "closed" });
    const send = sender();
    expect(await deliver(row?.id || "", send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });
  it("paciente requiere vínculo verificado vivo al entregar", async () => {
    await db.update(conversations).set({ lastMessageRole: "professional" });
    const rows = await queue(patient);
    const row = rows.find((row) => row.kind === "chat");
    await db.delete(patientConversationLinks);
    const send = sender();
    expect(await deliver(row?.id || "", send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });
  it("descanso pospone mensajes y descarta una cita que empieza antes", async () => {
    await optIn(pro, {
      ...preferences,
      quietEnabled: true,
      quietStart: 720,
      quietEnd: 780,
    });
    await enqueueWebPush(AT);
    const rows = await db.select().from(deliveries);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("chat");
    expect(rows[0].dueAt).toBe(AT + 3600000);
    const send = sender();
    expect(await deliver(rows[0].id, send)).toBe("unclaimed");
    expect(send).not.toHaveBeenCalled();
  });
  it("reintento acotado conserva la identidad opaca del aviso", async () => {
    const rows = await queue();
    const send = vi.fn(async () => ({
      ok: false as const,
      code: "temporary" as const,
      retryable: true,
    }));
    expect(await deliverWebPush(rows[0].id, AT, send, () => AT)).toBe("retry");
    const [row] = await db
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, rows[0].id));
    expect(row.nextAttemptAt).toBe(AT + 60000);
    expect(row.attempts).toBe(1);
  });
  it("410 retira sólo el dispositivo que falló", async () => {
    const rows = await queue();
    const send = vi.fn(async () => ({
      ok: false as const,
      code: "expired" as const,
      retryable: false,
    }));
    expect(await deliverWebPush(rows[0].id, AT, send, () => AT)).toBe("dead");
    expect(
      (await db.select().from(subscriptions))[0].sealedSubscription,
    ).toBeNull();
  });
  it("aviso pos-sesión tiene consentimiento profesional independiente", async () => {
    await db.update(practiceAppointments).set({
      startsAt: iso(AT - 7200000),
      endsAt: iso(AT - 1000),
      status: "completed",
    });
    const rows = await queue(pro, {
      ...preferences,
      chatEnabled: false,
      appointmentEnabled: false,
      afterSessionEnabled: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("after_session");
    const send = sender();
    expect(await deliver(rows[0].id, send)).toBe("sent");
    expect(
      await pushOpenDestination(pro.userId, pro.sessionId, rows[0].id, AT),
    ).toBe(
      "/pro/pacientes/fixture-push-practice-patient?notaSesion=fixture-push-appointment#notas",
    );
    expect(
      await pushOpenDestination(
        patient.userId,
        patient.sessionId,
        rows[0].id,
        AT,
      ),
    ).toBe("/entrar");
    expect(
      await pushOpenDestination(pro.userId, "wrong-session", rows[0].id, AT),
    ).toBe("/entrar");
  });
  it("cron no llama al proveedor con flag apagado", async () => {
    vi.stubEnv("NIDO_PUSH_ENABLED", "false");
    const send = sender();
    expect(await runWebPushJobs(AT, send, () => AT)).toMatchObject({
      enabled: false,
      enqueued: 0,
      processed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });
  it("una nota guardada después de encolar suprime el aviso pos-sesión", async () => {
    await db.update(practiceAppointments).set({
      startsAt: iso(AT - 7200000),
      endsAt: iso(AT - 1000),
      status: "completed",
    });
    const [row] = await queue(pro, {
      ...preferences,
      chatEnabled: false,
      appointmentEnabled: false,
      afterSessionEnabled: true,
    });
    await db.insert(practiceNotes).values({
      id: "fixture-push-note",
      professionalId: "fixture-push-professional",
      patientId: "fixture-push-practice-patient",
      appointmentId: "fixture-push-appointment",
      ciphertext: "fictitious-envelope-not-a-real-note",
      createdAt: iso(AT),
      updatedAt: iso(AT),
    });
    const send = sender();
    expect(await deliver(row.id, send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });
  it("sin cifrado de notas no encola recordatorios de notas", async () => {
    vi.stubEnv("NIDO_NOTES_ENCRYPTION_KEY", "");
    await db
      .update(practiceAppointments)
      .set({ startsAt: iso(AT - 7200000), endsAt: iso(AT - 1000) });
    expect(
      await queue(pro, {
        ...preferences,
        chatEnabled: false,
        appointmentEnabled: false,
        afterSessionEnabled: true,
      }),
    ).toHaveLength(0);
  });
  it("no reactiva actividad anterior al consentimiento", async () => {
    await subscribePush(pro, subscription, preferences, 0, AT);
    expect(await enqueueWebPush(AT)).toBe(0);
  });
  it("un cambio de preferencias invalida una entrega pendiente", async () => {
    const rows = await queue();
    const [device] = await db.select().from(subscriptions);
    await updatePushPreferences(
      pro,
      device.id,
      1,
      { ...preferences, chatEnabled: false },
      AT,
    );
    const send = sender();
    expect(await deliver(rows[0].id, send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });
  it("rotar VAPID requiere nuevo opt-in en cada dispositivo", async () => {
    const rows = await queue();
    const key = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    vi.stubEnv(
      "NIDO_PUSH_VAPID_PUBLIC_KEY",
      base64url(
        new Uint8Array(await crypto.subtle.exportKey("raw", key.publicKey)),
      ),
    );
    vi.stubEnv(
      "NIDO_PUSH_VAPID_PRIVATE_KEY",
      (await crypto.subtle.exportKey("jwk", key.privateKey)).d || "",
    );
    const send = sender();
    expect(await deliver(rows[0].id, send)).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });
  it("otro usuario no puede revocar un dispositivo ajeno", async () => {
    const { id } = await optIn();
    await revokePush(patient, id, AT);
    expect((await db.select().from(subscriptions))[0].revokedAt).toBeNull();
  });
  it("410 concurrente no revoca una renovación posterior", async () => {
    const rows = await queue();
    const [device] = await db.select().from(subscriptions);
    const send = vi.fn(async () => {
      await subscribePush(
        pro,
        subscription,
        preferences,
        device.revision,
        AT + 1000,
      );
      return { ok: false as const, code: "expired" as const, retryable: false };
    });
    expect(await deliverWebPush(rows[0].id, AT, send, () => AT)).toBe("dead");
    expect((await db.select().from(subscriptions))[0].revokedAt).toBeNull();
  });
  it("cron retira material de perfiles suspendidos", async () => {
    await optIn();
    await db.update(professionals).set({ status: "pending" });
    await runWebPushJobs(AT, sender(), () => AT);
    expect(
      (await db.select().from(subscriptions))[0].sealedSubscription,
    ).toBeNull();
  });
  it("cron limpia secretos de sesiones caducadas", async () => {
    await optIn();
    await db
      .update(session)
      .set({ expiresAt: new Date(AT - 1) })
      .where(eq(session.id, pro.sessionId));
    await runWebPushJobs(AT, sender(), () => AT);
    expect(
      (await db.select().from(subscriptions))[0].sealedSubscription,
    ).toBeNull();
  });
  it("migración conserva tablas históricas y añade checks", async () => {
    expect((await db.select().from(user)).length).toBe(2);
    await expect(
      db.run(
        sql`INSERT INTO web_push_subscriptions(id,user_id,role,endpoint_hash,vapid_key_hash,preferences_json,consent_at,created_at,updated_at) VALUES('bad',${pro.userId},'admin','fake','fake','{}',0,0,0)`,
      ),
    ).rejects.toThrow();
  });
});
