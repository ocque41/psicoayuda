import { Buffer } from "node:buffer";
import { eq, like } from "drizzle-orm";
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
import {
  googleCalendarConnections as connections,
  googleCalendarEventLinks as mappings,
  googleCalendarOAuthStates as states,
} from "@/db/calendar-schema";
import { patientAccounts, patientConversationLinks } from "@/db/patient-schema";
import {
  conversations,
  practiceAppointments,
  practicePatients,
  professionals,
  user,
} from "@/db/schema";
import {
  type CalendarActor,
  loadCalendarActor,
  ownedCalendarAppointments,
} from "@/lib/calendar/access";
import {
  GOOGLE_CALENDAR_SCOPE,
  googleCalendarConfig,
} from "@/lib/calendar/config";
import {
  calendarChallenge,
  openCalendarSecret,
  sealCalendarSecret,
} from "@/lib/calendar/crypto";
import { opaqueGoogleEvent } from "@/lib/calendar/google";
import { nidoCalendarIcs } from "@/lib/calendar/ics";
import {
  beginCalendarOAuth,
  completeCalendarOAuth,
  consumeCalendarState,
} from "@/lib/calendar/oauth";
import { saveCalendarPreferences } from "@/lib/calendar/preferences";
import { disconnectGoogleCalendar } from "@/lib/calendar/purge";
import {
  opaqueCalendarEventId,
  syncConnectedGoogleCalendars,
  syncGoogleCalendar,
} from "@/lib/calendar/sync";

const P = "test-google-calendar",
  id = (value: string) => `${P}-${value}`,
  now = new Date().toISOString();
const proActor: CalendarActor = {
  userId: id("pro-user"),
  audience: "pro",
  professionalId: id("pro"),
  timeZone: "UTC",
};
const patientActor: CalendarActor = {
  userId: id("patient"),
  audience: "patient",
  timeZone: "UTC",
};
const fetchMock = vi.fn();
const appointments = ["own", "unlinked", "foreign", "mismatch"].map(
  (name, i) => ({
    id: id(`appointment-${name}`),
    professionalId: id(name === "foreign" ? "other-pro" : "pro"),
    patientId: id(`record-${name}`),
    startsAt: new Date(Date.now() + (i + 3) * 86400000).toISOString(),
    endsAt: new Date(Date.now() + (i + 3) * 86400000 + 3000000).toISOString(),
    timeZone: "UTC",
    createdAt: now,
    updatedAt: now,
  }),
);
async function clearCalendar() {
  await db.delete(mappings).where(like(mappings.id, `${P}%`));
  const own = db
    .select({ id: connections.id })
    .from(connections)
    .where(like(connections.userId, `${P}%`));
  const { inArray } = await import("drizzle-orm");
  await db.delete(mappings).where(inArray(mappings.connectionId, own));
  await db.delete(connections).where(like(connections.userId, `${P}%`));
  await db.delete(states).where(like(states.userId, `${P}%`));
}
async function cleanup() {
  await clearCalendar();
  for (const [table, column] of [
    [practiceAppointments, practiceAppointments.id],
    [patientConversationLinks, patientConversationLinks.conversationId],
    [practicePatients, practicePatients.id],
    [conversations, conversations.id],
    [patientAccounts, patientAccounts.userId],
    [professionals, professionals.id],
    [user, user.id],
  ] as const)
    await db.delete(table).where(like(column, `${P}%`));
}
function setupEnv() {
  vi.stubEnv("NIDO_CALENDAR_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("NIDO_GOOGLE_CALENDAR_ENABLED", "true");
  vi.stubEnv("NIDO_GOOGLE_CALENDAR_CLIENT_ID", "calendar-client-ficticio");
  vi.stubEnv("NIDO_GOOGLE_CALENDAR_CLIENT_SECRET", "calendar-secret-ficticio");
  vi.stubEnv(
    "NIDO_GOOGLE_CALENDAR_REDIRECT_URI",
    "http://localhost:8792/api/calendar/google/callback",
  );
}
function successGoogle(url: string, _init: RequestInit) {
  if (url.endsWith("/token"))
    return Promise.resolve(
      Response.json({
        access_token: "access-ficticio",
        refresh_token: "refresh-ficticio",
        expires_in: 3600,
        scope: GOOGLE_CALENDAR_SCOPE,
      }),
    );
  if (url.endsWith("/revoke"))
    return Promise.resolve(new Response(null, { status: 200 }));
  if (url.endsWith("/calendars"))
    return Promise.resolve(Response.json({ id: "calendar-ficticio" }));
  return Promise.resolve(Response.json({ id: "event-ficticio" }));
}
async function connection(
  actor = proActor,
  options: { leaseUntil?: string; autoSync?: boolean; expired?: boolean } = {},
) {
  const connectionId = id(`connection-${actor.audience}`),
    tokens = {
      accessToken: "access-ficticio",
      refreshToken: "refresh-ficticio",
      expiresAt: Date.now() + (options.expired ? -100 : 3600000),
    };
  await db.insert(connections).values({
    id: connectionId,
    userId: actor.userId,
    audience: actor.audience,
    tokenEnvelope: await sealCalendarSecret(
      JSON.stringify(tokens),
      "token",
      actor.userId,
      actor.audience,
      connectionId,
    ),
    calendarId: "calendar-ficticio",
    leaseUntil: options.leaseUntil,
    autoSync: options.autoSync,
    createdAt: now,
    updatedAt: now,
  });
  return connectionId;
}

describe("Google Calendar privado y unidireccional", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values(
      ["pro-user", "other-pro-user", "patient", "other-patient"].map(
        (name) => ({
          id: id(name),
          name: "Cuenta ficticia",
          email: `${id(name)}@example.test`,
          emailVerified: true,
        }),
      ),
    );
    await db.insert(professionals).values(
      ["pro", "other-pro"].map((name) => ({
        id: id(name),
        userId: id(`${name}-user`),
        fullName: "Profesional ficticio",
        email: `${id(name)}@example.test`,
        status: "approved",
        languages: '["es"]',
        supportAreas: "[]",
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.insert(patientAccounts).values(
      ["patient", "other-patient"].map((name) => ({
        userId: id(name),
        displayName: "Alias ficticio",
        onboardingCompletedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.insert(conversations).values(
      ["own", "foreign", "mismatch"].map((name) => ({
        id: id(`chat-${name}`),
        professionalId: id(name === "own" ? "pro" : "other-pro"),
        seekerSid: id(name),
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.insert(patientConversationLinks).values(
      ["own", "foreign", "mismatch"].map((name) => ({
        conversationId: id(`chat-${name}`),
        userId: id(name === "foreign" ? "other-patient" : "patient"),
        verifiedBy: "seeker_session",
        verifiedAt: now,
      })),
    );
    await db.insert(practicePatients).values(
      ["own", "unlinked", "foreign", "mismatch"].map((name) => ({
        id: id(`record-${name}`),
        professionalId: id(name === "foreign" ? "other-pro" : "pro"),
        name: "Ficha ficticia",
        conversationId: name === "unlinked" ? null : id(`chat-${name}`),
        country: "VE",
        timeZone: "UTC",
        consentAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.insert(practiceAppointments).values(appointments);
  });
  beforeEach(() => {
    setupEnv();
    fetchMock.mockReset().mockImplementation(successGoogle);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(async () => {
    await clearCalendar();
    await db
      .update(professionals)
      .set({ status: "approved", nonClinicalHelper: false })
      .where(eq(professionals.id, id("pro")));
    await db
      .update(conversations)
      .set({
        status: "open",
        closedAt: null,
        deletedAt: null,
        anonymizedAt: null,
      })
      .where(eq(conversations.id, id("chat-own")));
    await db
      .update(practicePatients)
      .set({ status: "new" })
      .where(eq(practicePatients.id, id("record-own")));
    await db
      .update(practiceAppointments)
      .set({
        status: "scheduled",
        startsAt: appointments[0].startsAt,
        endsAt: appointments[0].endsAt,
        updatedAt: appointments[0].updatedAt,
      })
      .where(eq(practiceAppointments.id, id("appointment-own")));
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, id("patient")));
    await db
      .update(patientAccounts)
      .set({ deletionState: "active" })
      .where(eq(patientAccounts.userId, id("patient")));
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  afterAll(cleanup);

  it("no usa las credenciales de login y requiere configuración dedicada completa", () => {
    vi.stubEnv("NIDO_GOOGLE_CALENDAR_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "login-ficticio");
    expect(googleCalendarConfig()).toBeNull();
    vi.stubEnv("NIDO_GOOGLE_CALENDAR_CLIENT_ID", "calendar-ficticio");
    vi.stubEnv(
      "NIDO_GOOGLE_CALENDAR_REDIRECT_URI",
      "https://mal.example.test/otro",
    );
    expect(googleCalendarConfig()).toBeNull();
  });
  it("cifra tokens con nonce y propósito/cuenta/rol/conexión como AAD", async () => {
    const sealed = await sealCalendarSecret(
        "refresh-ficticio",
        "token",
        "cuenta-a",
        "pro",
        "conexion-a",
      ),
      other = await sealCalendarSecret(
        "refresh-ficticio",
        "token",
        "cuenta-a",
        "pro",
        "conexion-a",
      );
    expect(sealed).not.toContain("refresh-ficticio");
    expect(sealed).not.toBe(other);
    expect(
      await openCalendarSecret(
        sealed,
        "token",
        "cuenta-a",
        "pro",
        "conexion-a",
      ),
    ).toBe("refresh-ficticio");
    for (const params of [
      ["state", "cuenta-a", "pro", "conexion-a"],
      ["token", "cuenta-b", "pro", "conexion-a"],
      ["token", "cuenta-a", "patient", "conexion-a"],
      ["token", "cuenta-a", "pro", "conexion-b"],
    ] as const)
      await expect(
        openCalendarSecret(sealed, params[0], params[1], params[2], params[3]),
      ).rejects.toThrow();
  });
  it("PKCE usa S256 y state expirable de una sola cuenta y un solo uso", async () => {
    const url = new URL(await beginCalendarOAuth(proActor)),
      state = url.searchParams.get("state") || "";
    expect(url.searchParams.get("scope")).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(url.searchParams.get("include_granted_scopes")).toBe("false");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(await consumeCalendarState(id("other-pro-user"), state)).toBeNull();
    const row = await consumeCalendarState(proActor.userId, state);
    expect(row).not.toBeNull();
    const verifier = await openCalendarSecret(
      row?.verifierEnvelope || "",
      "state",
      proActor.userId,
      "pro",
      row?.stateHash || "",
    );
    expect(await calendarChallenge(verifier)).toBe(
      url.searchParams.get("code_challenge"),
    );
    expect(await consumeCalendarState(proActor.userId, state)).toBeNull();
    const expiredUrl = new URL(await beginCalendarOAuth(proActor));
    await db
      .update(states)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(states.userId, proActor.userId));
    expect(
      await consumeCalendarState(
        proActor.userId,
        expiredUrl.searchParams.get("state") || "",
      ),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rechazar consentimiento consume el state sin conectar ni llamar a Google", async () => {
    const url = new URL(await beginCalendarOAuth(proActor)),
      state = url.searchParams.get("state") || "";
    expect(
      await completeCalendarOAuth(proActor.userId, state, null, true),
    ).toMatchObject({ status: "denied" });
    expect(await consumeCalendarState(proActor.userId, state)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("un callback pendiente no vuelve a conectar después de desconectar", async () => {
    const url = new URL(await beginCalendarOAuth(proActor));
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/token")) {
        entered();
        await gate;
      }
      return successGoogle(url, init);
    });
    const callback = completeCalendarOAuth(
      proActor.userId,
      url.searchParams.get("state") || "",
      "code-ficticio",
    );
    await waiting;
    await disconnectGoogleCalendar(proActor.userId);
    release();
    expect(await callback).toMatchObject({ status: "state" });
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.userId, proActor.userId),
      }),
    ).toBeUndefined();
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/revoke")),
    ).toHaveLength(1);
  });
  it("un conflicto de conexión no anuncia connected ni revoca la conexión vigente", async () => {
    const url = new URL(await beginCalendarOAuth(proActor));
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/token")) {
        entered();
        await gate;
      }
      return successGoogle(url, init);
    });
    const callback = completeCalendarOAuth(
      proActor.userId,
      url.searchParams.get("state") || "",
      "code-ficticio",
    );
    await waiting;
    await connection(proActor);
    release();
    expect(await callback).toMatchObject({ status: "state" });
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/revoke")),
    ).toHaveLength(0);
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.userId, proActor.userId),
      }),
    ).toMatchObject({ status: "connected" });
  });
  it("exporta únicamente la agenda propia vinculada y reevalúa suspensión, cierre y baja", async () => {
    expect(
      (await ownedCalendarAppointments(patientActor)).map((r) => r.id),
    ).toEqual([id("appointment-own")]);
    expect(
      (await ownedCalendarAppointments(proActor)).every(
        (r) => r.id !== id("appointment-foreign"),
      ),
    ).toBe(true);
    for (const update of [
      { status: "closed" },
      { closedAt: now },
      { anonymizedAt: now },
      { deletedAt: new Date(now) },
    ]) {
      await db
        .update(conversations)
        .set(update)
        .where(eq(conversations.id, id("chat-own")));
      expect(await ownedCalendarAppointments(patientActor)).toEqual([]);
      await db
        .update(conversations)
        .set({
          status: "open",
          closedAt: null,
          anonymizedAt: null,
          deletedAt: null,
        })
        .where(eq(conversations.id, id("chat-own")));
    }
    await db
      .update(professionals)
      .set({ status: "suspended" })
      .where(eq(professionals.id, id("pro")));
    expect(await ownedCalendarAppointments(patientActor)).toEqual([]);
    expect(await loadCalendarActor(proActor.userId, "pro")).toBeNull();
    await db
      .update(professionals)
      .set({ status: "approved", nonClinicalHelper: true })
      .where(eq(professionals.id, id("pro")));
    expect(await ownedCalendarAppointments(patientActor)).toEqual([]);
    await db
      .update(professionals)
      .set({ nonClinicalHelper: false })
      .where(eq(professionals.id, id("pro")));
    await db
      .update(patientAccounts)
      .set({ deletionState: "deleting" })
      .where(eq(patientAccounts.userId, patientActor.userId));
    expect(await ownedCalendarAppointments(patientActor)).toEqual([]);
  });
  it("cerrar ficha o retirar verificación excluye la nueva exportación", async () => {
    await db
      .update(practicePatients)
      .set({ status: "closed" })
      .where(eq(practicePatients.id, id("record-own")));
    expect(await ownedCalendarAppointments(patientActor)).toEqual([]);
    await db
      .update(practicePatients)
      .set({ status: "new" })
      .where(eq(practicePatients.id, id("record-own")));
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, patientActor.userId));
    expect(await ownedCalendarAppointments(patientActor)).toEqual([]);
    expect(await loadCalendarActor(patientActor.userId, "patient")).toBeNull();
  });
  it("ICS usa UTC, título fijo, UID opaco y ninguna identidad ni URL privada", async () => {
    const raw = {
      ...appointments[0],
      id: "paciente-malicioso\r\nATTENDEE:mailto:privado@example.test",
    };
    const ics = await nidoCalendarIcs(
      [raw],
      patientActor.userId,
      "patient",
      new Date(now),
    );
    expect(ics).toContain("SUMMARY:Sesión Nido\r\n");
    expect(ics).toContain("CLASS:PRIVATE");
    expect(ics).not.toMatch(
      /paciente-malicioso|ATTENDEE|privado@|\/pro\/|\/c\/|VALARM/,
    );
    expect(
      ics.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75),
    ).toBe(true);
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });
  it("Google recibe solo tiempos, título fijo, eventId hash y avisos desactivados inicialmente", async () => {
    const eventId = await opaqueCalendarEventId(
      "conexion-ficticia",
      "ficha-confidencial",
    );
    const event = opaqueGoogleEvent(
      { ...appointments[0], name: "No exportar" } as (typeof appointments)[0],
      eventId,
    );
    expect(eventId).toMatch(/^n[0-9a-f]{64}$/);
    expect(JSON.stringify(event)).not.toMatch(
      /No exportar|ficha-confidencial|appointment|email|notes|attendees/,
    );
    expect(event.reminders).toEqual({ useDefault: false });
  });
  it("sincroniza sin duplicar y elimina únicamente el evento mapeado cancelado", async () => {
    const connectionId = await connection(patientActor);
    const first = await syncGoogleCalendar(patientActor);
    expect(first.complete).toBe(true);
    expect(first.count).toBe(1);
    const one = await db.query.googleCalendarEventLinks.findFirst({
      where: eq(mappings.connectionId, connectionId),
    });
    expect(one?.status).toBe("active");
    await syncGoogleCalendar(patientActor);
    expect(
      await db
        .select()
        .from(mappings)
        .where(eq(mappings.connectionId, connectionId)),
    ).toHaveLength(1);
    await db
      .update(practiceAppointments)
      .set({ status: "cancelled" })
      .where(eq(practiceAppointments.id, id("appointment-own")));
    const cancelled = await syncGoogleCalendar(patientActor);
    expect(cancelled.complete).toBe(true);
    const deletes = fetchMock.mock.calls.filter(
      ([, init]) => init.method === "DELETE",
    );
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0]).toContain(one?.eventId);
    expect(deletes[0][0]).not.toContain(id("appointment-own"));
  });
  it.each([
    "patient",
    "pro",
  ] as const)("%s retira la copia reprogramada fuera de365 días y la recrea al volver", async (audience) => {
    const actor = audience === "patient" ? patientActor : proActor,
      connectionId = await connection(actor);
    await syncGoogleCalendar(actor);
    const original = await db.query.googleCalendarEventLinks.findFirst({
      where: eq(mappings.appointmentId, appointments[0].id),
    });
    expect(original?.status).toBe("active");
    const outsideStart = new Date(Date.now() + 400 * 86400000).toISOString(),
      outsideEnd = new Date(
        Date.now() + 400 * 86400000 + 3000000,
      ).toISOString();
    await db
      .update(practiceAppointments)
      .set({
        startsAt: outsideStart,
        endsAt: outsideEnd,
        updatedAt: "2026-10-03T22:10:00.000Z",
      })
      .where(eq(practiceAppointments.id, appointments[0].id));
    fetchMock.mockClear();
    expect((await syncGoogleCalendar(actor, { force: false })).complete).toBe(
      true,
    );
    const requests = fetchMock.mock.calls.filter(([url]) =>
      url.includes("/events"),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0][1].method).toBe("DELETE");
    expect(requests[0][0]).toContain(original?.eventId);
    expect(requests[0][0]).not.toContain(appointments[0].id);
    expect(
      await db.query.googleCalendarEventLinks.findFirst({
        where: eq(mappings.appointmentId, appointments[0].id),
      }),
    ).toMatchObject({ status: "cancelled" });
    fetchMock.mockClear();
    await syncGoogleCalendar(actor, { force: false });
    expect(fetchMock).not.toHaveBeenCalled();
    const insideStart = new Date(Date.now() + 8 * 86400000).toISOString(),
      insideEnd = new Date(Date.now() + 8 * 86400000 + 3000000).toISOString();
    await db
      .update(practiceAppointments)
      .set({
        startsAt: insideStart,
        endsAt: insideEnd,
        updatedAt: "2026-10-03T22:11:00.000Z",
      })
      .where(eq(practiceAppointments.id, appointments[0].id));
    fetchMock.mockImplementation((url: string, init: RequestInit) =>
      url.includes(original?.eventId || "missing") && init.method === "PUT"
        ? Promise.resolve(new Response(null, { status: 410 }))
        : successGoogle(url, init),
    );
    await syncGoogleCalendar(actor, { force: false });
    const current = await db.query.googleCalendarEventLinks.findFirst({
      where: eq(mappings.appointmentId, appointments[0].id),
    });
    expect(current).toMatchObject({
      connectionId,
      status: "active",
      generation: 1,
    });
    expect(current?.eventId).not.toBe(original?.eventId);
    const created = fetchMock.mock.calls
      .filter(([, init]) => init.method === "POST")
      .map(([, init]) => JSON.parse(init.body as string));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: current?.eventId,
      summary: "Sesión Nido",
      start: { dateTime: insideStart },
      end: { dateTime: insideEnd },
    });
    expect(JSON.stringify(created)).not.toContain(outsideStart);
  });
  it("el lease impide dos sincronizaciones y un fallo conserva cursor/token para reintentar", async () => {
    const connectionId = await connection(patientActor, {
      leaseUntil: new Date(Date.now() + 600000).toISOString(),
    });
    await expect(syncGoogleCalendar(patientActor)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    await db
      .update(connections)
      .set({ leaseUntil: null })
      .where(eq(connections.id, connectionId));
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(syncGoogleCalendar(patientActor)).rejects.toThrow(
      "calendar_retry",
    );
    const row = await db.query.googleCalendarConnections.findFirst({
      where: eq(connections.id, connectionId),
    });
    expect(row).toMatchObject({
      status: "connected",
      leaseId: null,
      errorCode: "retry",
      syncCursor: null,
    });
    expect(row?.tokenEnvelope).not.toContain("refresh-ficticio");
  });
  it.each([
    200, 404,
  ])("un runner que pierde el lease durante HTTP %s no escribe ni inicia otro request", async (responseStatus) => {
    const connectionId = await connection(patientActor);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    fetchMock.mockImplementation(async () => {
      entered();
      await gate;
      return new Response(null, { status: responseStatus });
    });
    const result = syncGoogleCalendar(patientActor);
    await waiting;
    const replacementLease = "runner-nuevo-ficticio";
    await db
      .update(connections)
      .set({
        leaseId: replacementLease,
        leaseUntil: new Date(Date.now() + 600000).toISOString(),
      })
      .where(eq(connections.id, connectionId));
    release();
    await expect(result).rejects.toThrow("calendar_retry");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.id, connectionId),
      }),
    ).toMatchObject({
      leaseId: replacementLease,
      lastSyncedAt: null,
      errorCode: null,
    });
    expect(
      await db.query.googleCalendarEventLinks.findFirst({
        where: eq(mappings.connectionId, connectionId),
      }),
    ).toMatchObject({ status: "pending", sourceUpdatedAt: null });
  });
  it("cron solo actúa tras opt-in y no hace red en eventos sin cambios", async () => {
    const connectionId = await connection(patientActor);
    expect(await syncConnectedGoogleCalendars()).toMatchObject({
      processed: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await db
      .update(connections)
      .set({ autoSync: true })
      .where(eq(connections.id, connectionId));
    expect(await syncConnectedGoogleCalendars()).toMatchObject({
      processed: 1,
      updated: 1,
      failed: 0,
    });
    fetchMock.mockClear();
    expect(await syncConnectedGoogleCalendars()).toMatchObject({
      processed: 1,
      updated: 0,
      failed: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("una pestaña antigua no reactiva preferencias retiradas ni cambia otra cuenta", async () => {
    const connectionId = await connection(patientActor);
    expect(
      await saveCalendarPreferences(patientActor.userId, "patient", 0, {
        autoSync: true,
        googleReminders: true,
      }),
    ).toBe(true);
    expect(
      await saveCalendarPreferences(patientActor.userId, "patient", 1, {
        autoSync: false,
        googleReminders: false,
      }),
    ).toBe(true);
    expect(
      await saveCalendarPreferences(patientActor.userId, "patient", 0, {
        autoSync: true,
        googleReminders: true,
      }),
    ).toBe(false);
    expect(
      await saveCalendarPreferences(id("other-patient"), "patient", 2, {
        autoSync: true,
        googleReminders: true,
      }),
    ).toBe(false);
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.id, connectionId),
      }),
    ).toMatchObject({
      autoSync: false,
      googleReminders: false,
      preferencesRevision: 2,
    });
  });

  it("guardar preferencias reevalúa verificación y aprobación dentro de la escritura", async () => {
    await connection(patientActor);
    await connection(proActor);
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, patientActor.userId));
    expect(
      await saveCalendarPreferences(patientActor.userId, "patient", 0, {
        autoSync: true,
        googleReminders: true,
      }),
    ).toBe(false);
    await db
      .update(professionals)
      .set({ status: "suspended" })
      .where(eq(professionals.id, proActor.professionalId || ""));
    expect(
      await saveCalendarPreferences(proActor.userId, "pro", 0, {
        autoSync: true,
        googleReminders: true,
      }),
    ).toBe(false);
    expect(
      await saveCalendarPreferences(patientActor.userId, "patient", 0, {
        autoSync: false,
        googleReminders: false,
      }),
    ).toBe(true);
    expect(
      await saveCalendarPreferences(proActor.userId, "pro", 0, {
        autoSync: false,
        googleReminders: false,
      }),
    ).toBe(true);
  });

  it("la cola avanza en lotes acotados y conserva el cursor entre pasos", async () => {
    const connectionId = await connection(proActor);
    const first = await syncGoogleCalendar(proActor, { batchSize: 1 });
    expect(first.complete).toBe(false);
    expect(first.count).toBe(1);
    const current = await db.query.googleCalendarConnections.findFirst({
      where: eq(connections.id, connectionId),
    });
    expect(current?.syncCursor).toContain('"phase":"source"');
    let completed = first;
    for (let attempt = 0; attempt < 8 && !completed.complete; attempt++)
      completed = await syncGoogleCalendar(proActor, { batchSize: 1 });
    expect(completed.complete).toBe(true);
    expect(
      await db
        .select()
        .from(mappings)
        .where(eq(mappings.connectionId, connectionId)),
    ).toHaveLength(3);
  });

  it("un token revocado requiere reconectar sin enviar eventos ni perder el cifrado", async () => {
    const connectionId = await connection(patientActor, { expired: true });
    fetchMock.mockResolvedValue(
      Response.json({ error: "invalid_grant" }, { status: 400 }),
    );
    await expect(syncGoogleCalendar(patientActor)).rejects.toThrow(
      "calendar_reconnect",
    );
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.id, connectionId),
      }),
    ).toMatchObject({ status: "needs_reconnect", errorCode: "reconnect" });
    expect(fetchMock.mock.calls).toHaveLength(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://oauth2.googleapis.com/token",
    );
  });

  it("PUT ausente usa INSERT con el mismo ID y una repetición no duplica el enlace", async () => {
    const connectionId = await connection(patientActor);
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      Promise.resolve(
        init.method === "PUT"
          ? new Response(null, { status: 404 })
          : Response.json({ id: "ficticio" }),
      ),
    );
    await syncGoogleCalendar(patientActor);
    const requests = fetchMock.mock.calls.filter(([url]) =>
      url.includes("/events"),
    );
    expect(requests.map(([, init]) => init.method)).toEqual(["PUT", "POST"]);
    expect(JSON.parse(requests[0][1].body as string).id).toBe(
      JSON.parse(requests[1][1].body as string).id,
    );
    expect(
      await db
        .select()
        .from(mappings)
        .where(eq(mappings.connectionId, connectionId)),
    ).toHaveLength(1);
  });

  it("un permiso parcial no crea una falsa conexión", async () => {
    const url = new URL(await beginCalendarOAuth(proActor));
    fetchMock.mockResolvedValue(
      Response.json({
        access_token: "access-ficticio",
        refresh_token: "refresh-ficticio",
        expires_in: 3600,
        scope: "otro-scope",
      }),
    );
    await expect(
      completeCalendarOAuth(
        proActor.userId,
        url.searchParams.get("state") || "",
        "code-ficticio",
      ),
    ).rejects.toThrow();
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.userId, proActor.userId),
      }),
    ).toBeUndefined();
  });
  it("desconectar conserva otras cuentas y limpia state/mapeos/tokens propios después de revocar", async () => {
    const connectionId = await connection(patientActor);
    await syncGoogleCalendar(patientActor);
    await beginCalendarOAuth(proActor);
    await connection(proActor);
    await disconnectGoogleCalendar(patientActor.userId);
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.id, connectionId),
      }),
    ).toBeUndefined();
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.userId, proActor.userId),
      }),
    ).toBeDefined();
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === "https://oauth2.googleapis.com/revoke",
      ),
    ).toBe(true);
  });
  it("el borrado bloquea ambos roles antes de esperar la revocación de Calendar", async () => {
    const accountId = id("purge-user"),
      professionalId = id("purge-pro");
    await db.insert(user).values({
      id: accountId,
      name: "Cuenta ficticia",
      email: `${accountId}@example.test`,
      emailVerified: true,
    });
    await db.insert(patientAccounts).values({
      userId: accountId,
      displayName: "Alias ficticio",
      onboardingCompletedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(professionals).values({
      id: professionalId,
      userId: accountId,
      fullName: "Profesional ficticio",
      email: `${professionalId}@example.test`,
      status: "approved",
      languages: '["es"]',
      supportAreas: "[]",
      createdAt: now,
      updatedAt: now,
    });
    const actor: CalendarActor = {
      userId: accountId,
      audience: "pro",
      professionalId,
      timeZone: "UTC",
    };
    await connection(actor);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/revoke")) {
        entered();
        await gate;
      }
      return successGoogle(url, init);
    });
    const { purgeAccount } = await import("@/lib/account");
    const purge = purgeAccount(accountId);
    await waiting;
    expect(await loadCalendarActor(accountId, "pro")).toBeNull();
    expect(await loadCalendarActor(accountId, "patient")).toBeNull();
    await expect(
      beginCalendarOAuth({
        userId: accountId,
        audience: "patient",
        timeZone: "UTC",
      }),
    ).rejects.toThrow("calendar_permission_changed");
    release();
    await purge;
    expect(
      await db.query.user.findFirst({ where: eq(user.id, accountId) }),
    ).toBeUndefined();
    expect(
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/token")),
    ).toHaveLength(0);
  });
  it("si falla revocar, retiene el cifrado y pausa actualizaciones sin borrar el grant", async () => {
    const connectionId = await connection(patientActor);
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      disconnectGoogleCalendar(patientActor.userId),
    ).rejects.toThrow();
    expect(
      await db.query.googleCalendarConnections.findFirst({
        where: eq(connections.id, connectionId),
      }),
    ).toMatchObject({ status: "disconnecting" });
  });
});
