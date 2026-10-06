import { eq, like } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
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
import { googleCalendarConnections } from "@/db/calendar-schema";
import { professionalMemberships, professionals, user } from "@/db/schema";

const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/components/auth-panel", () => ({
  AuthPanel: ({ callbackURL }: { callbackURL: string }) => (
    <div data-login={callbackURL}>Acceso privado</div>
  ),
}));

import AdminConsolePage, { dynamic, metadata } from "@/app/admin/consola/page";
import {
  consoleAreas,
  resolveConsoleArea,
} from "@/components/admin/crm-console";

const P = "test-admin-console-";
const admins = ["console-first@example.test", "console-second@example.test"];
const privateValue = "fixture-private-do-not-render";
const timestamp = "2026-10-04T12:00:00.000Z";
async function cleanup() {
  await db
    .delete(googleCalendarConnections)
    .where(like(googleCalendarConnections.id, `${P}%`));
  await db
    .delete(professionalMemberships)
    .where(like(professionalMemberships.professionalId, `${P}%`));
  await db.delete(professionals).where(like(professionals.id, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
}
function signedIn(index = 0, overrides: Record<string, unknown> = {}) {
  mocks.session.mockResolvedValue({
    user: {
      id: `${P}${index}`,
      email: admins[index] || "console-staff@example.test",
      emailVerified: true,
      ...overrides,
    },
  });
}
function render(area?: string | string[]) {
  return AdminConsolePage({ searchParams: Promise.resolve({ area }) }).then(
    renderToStaticMarkup,
  );
}
beforeAll(async () => {
  await cleanup();
  await db.insert(user).values([
    {
      id: `${P}0`,
      name: "Primer admin ficticio",
      email: admins[0],
      emailVerified: true,
    },
    {
      id: `${P}1`,
      name: "Segundo admin ficticio",
      email: admins[1],
      emailVerified: true,
    },
    {
      id: `${P}2`,
      name: "Soporte ficticio",
      email: "console-staff@example.test",
      emailVerified: true,
    },
  ]);
  await db.insert(googleCalendarConnections).values({
    id: `${P}calendar`,
    userId: `${P}0`,
    audience: "pro",
    tokenEnvelope: privateValue,
    calendarId: `${privateValue}@example.test`,
    status: "connected",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(professionals).values({
    id: `${P}pro`,
    fullName: "Profesional ficticio de consola",
    email: "console-clinical@example.test",
    userId: `${P}0`,
    status: "approved",
    country: "España",
    languages: '["es"]',
    supportAreas: "[]",
    offersPaidServices: true,
    stripeAccountId: privateValue,
    stripeChargesEnabled: true,
    stripePayoutsEnabled: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  await db.insert(professionalMemberships).values({
    professionalId: `${P}pro`,
    trialStartedAt: timestamp,
    trialEndsAt: "2027-01-02T12:00:00.000Z",
    status: "trialing",
    updatedAt: timestamp,
  });
});
beforeEach(async () => {
  vi.stubEnv("ADMIN_EMAILS", admins.join(","));
  vi.stubEnv("SUPPORT_EMAILS", "console-staff@example.test");
  vi.stubEnv("CREDENTIAL_REVIEWER_EMAILS", "console-staff@example.test");
  for (const key of [
    "NIDO_PRACTICE_ENABLED",
    "NIDO_GOOGLE_CALENDAR_ENABLED",
    "NIDO_MEMBERSHIP_BILLING_ENABLED",
    "NIDO_CARE_BILLING_ENABLED",
    "NIDO_CALL_CAPTURE_ENABLED",
  ])
    vi.stubEnv(key, "false");
  for (const key of [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "DAILY_API_KEY",
    "RESEND_API_KEY",
    "CONTACT_FROM_EMAIL",
    "NIDO_GOOGLE_CALENDAR_CLIENT_ID",
    "NIDO_GOOGLE_CALENDAR_CLIENT_SECRET",
    "NIDO_GOOGLE_CALENDAR_REDIRECT_URI",
    "NIDO_CALENDAR_ENCRYPTION_KEY",
    "NIDO_CALL_CAPTURE_POLICY_URL",
  ])
    vi.stubEnv(key, "");
  await db
    .update(user)
    .set({ email: admins[0], emailVerified: true })
    .where(eq(user.id, `${P}0`));
  await db
    .update(googleCalendarConnections)
    .set({ status: "connected" })
    .where(eq(googleCalendarConnections.id, `${P}calendar`));
  signedIn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(cleanup);

describe("consola CRM privada", () => {
  it.each([
    0, 1,
  ])("permite al admin %s sin crear ni consultar perfil clínico", async (index) => {
    signedIn(index);
    const values = vi.spyOn(db, "values");
    const professionalQuery = vi.spyOn(db.query.professionals, "findFirst");
    const fetch = vi.spyOn(globalThis, "fetch");
    const html = await render();
    expect(html).toContain("Apartados de la consola");
    expect(html).toContain('id="consola"');
    expect(values).not.toHaveBeenCalled();
    expect(professionalQuery).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(html).not.toMatch(/console-(?:first|second|clinical)@example\.test/);
    expect(html).not.toContain("Profesional ficticio de consola");
    expect(html).not.toContain(privateValue);
  });
  it.each([
    "anonymous",
    "staff",
    "unverified",
    "changed-email",
    "missing",
  ])("deniega %s antes de leer evidencia", async (kind) => {
    if (kind === "anonymous") mocks.session.mockResolvedValue(null);
    if (kind === "staff") signedIn(2);
    if (kind === "missing") signedIn(0, { id: `${P}missing` });
    if (kind === "unverified")
      await db
        .update(user)
        .set({ emailVerified: false })
        .where(eq(user.id, `${P}0`));
    if (kind === "changed-email")
      await db
        .update(user)
        .set({ email: "console-former@example.test" })
        .where(eq(user.id, `${P}0`));
    const values = vi.spyOn(db, "values");
    const html = await render("facturacion");
    expect(values).not.toHaveBeenCalled();
    expect(html).not.toContain("Apartados de la consola");
    expect(html).not.toContain("Clave Stripe");
    expect(html).not.toContain("Secciones de administración");
    expect(html).toContain(
      kind === "anonymous" ? 'data-login="/admin/consola"' : "no tiene acceso",
    );
  });
  it("propaga caída de identidad sin leer ni presentar configuración", async () => {
    vi.spyOn(db.query.user, "findFirst").mockRejectedValue(
      new Error(privateValue),
    );
    const values = vi.spyOn(db, "values");
    await expect(render("facturacion")).rejects.toThrow(privateValue);
    expect(values).not.toHaveBeenCalled();
  });
  it.each(
    consoleAreas.map((area) => area.id),
  )("%s tiene un único panel y consultas acotadas al apartado", async (area) => {
    const values = vi.spyOn(db, "values");
    const html = await render(area);
    expect(html.match(/id="console-panel-title"/g)).toHaveLength(1);
    expect(html).toContain(`href="/admin/consola?area=${area}"`);
    const queries = ["calendario", "avisos", "facturacion"].includes(area);
    expect(values).toHaveBeenCalledTimes(queries ? 1 : 0);
    const sectionQueries = [
      "google_calendar_connections",
      "appointment_reminder_deliveries",
      "professional_memberships",
    ];
    const expectedQuery =
      area === "calendario"
        ? sectionQueries[0]
        : area === "avisos"
          ? sectionQueries[1]
          : area === "facturacion"
            ? sectionQueries[2]
            : undefined;
    if (expectedQuery) {
      const sqlSource = JSON.stringify(values.mock.calls);
      expect(sqlSource).toContain(expectedQuery);
      for (const other of sectionQueries.filter(
        (table) => table !== expectedQuery,
      ))
        expect(sqlSource).not.toContain(other);
    }
    expect(html).not.toContain(privateValue);
  });
  it("muestra conexión guardada y facturación registrada sin certificarlas", async () => {
    const calendar = await render("calendario");
    expect(calendar).toContain(
      "Hay una conexión guardada como activa</dt><dd>Sí",
    );
    expect(calendar).toContain("no prueba que el token siga válido");
    await db
      .update(googleCalendarConnections)
      .set({ status: "revoked" })
      .where(eq(googleCalendarConnections.id, `${P}calendar`));
    expect(await render("calendario")).toContain(
      "Hay una conexión guardada como activa</dt><dd>No",
    );
    const billing = await render("facturacion");
    expect(billing).toContain("Hay una membresía registrada</dt><dd>Sí");
    expect(billing).toContain(
      "Hay una cuenta Connect habilitada en el registro</dt><dd>Sí",
    );
    expect(billing).toContain("no acreditan modo live");
  });
  it.each([
    "error",
    "empty",
    "invalid",
  ])("evidencia %s queda sin comprobar y no expone el error", async (kind) => {
    const values = vi.spyOn(db, "values");
    if (kind === "error")
      values.mockRejectedValue(new Error(`${privateValue} SQL SELECT`));
    else values.mockResolvedValue(kind === "empty" ? [] : [[17]]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = await render("calendario");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Sin comprobar");
    expect(html).not.toContain(
      "Hay una conexión guardada como activa</dt><dd>No",
    );
    expect(html).not.toContain(privateValue);
    expect(log).not.toHaveBeenCalled();
  });
  it("separa flag, presencia y configuración válida; nunca serializa valores", async () => {
    vi.stubEnv("NIDO_GOOGLE_CALENDAR_ENABLED", "true");
    vi.stubEnv("NIDO_GOOGLE_CALENDAR_CLIENT_ID", privateValue);
    vi.stubEnv("NIDO_GOOGLE_CALENDAR_CLIENT_SECRET", privateValue);
    vi.stubEnv(
      "NIDO_GOOGLE_CALENDAR_REDIRECT_URI",
      "https://example.test/wrong-path",
    );
    vi.stubEnv("NIDO_CALENDAR_ENCRYPTION_KEY", "invalid");
    const html = await render("calendario");
    expect(html).toContain("Conexión habilitada</dt><dd>Sí");
    expect(html).toContain("Cliente OAuth presente</dt><dd>Sí");
    expect(html).toContain("Configuración completa y válida</dt><dd>No");
    expect(html).not.toContain(privateValue);
    expect(html).not.toContain("example.test/wrong-path");
  });
  it("preserva noindex, ruta dinámica, favoritos y acceso a revisión CRM", async () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(dynamic).toBe("force-dynamic");
    expect(resolveConsoleArea(["calendario", "llamadas"])).toBe("calendario");
    expect(resolveConsoleArea("unknown")).toBe("resumen");
    expect(resolveConsoleArea(undefined)).toBe("resumen");
    const html = await render("practica");
    expect(html).toContain('href="/admin/crm"');
    expect(html).toContain("ni permite entrar en la consulta de otra persona");
  });
});
