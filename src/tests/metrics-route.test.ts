import { like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { clickEvents, contactMessages } from "@/db/schema";
import { readAdminMetrics } from "@/lib/admin-metrics";
import { isAdminMetrics } from "@/shared/admin-metrics";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));

import { GET } from "@/app/api/admin/metrics/route";

const prefix = "test-metrics-";
const day = 86_400_000;
const now = Date.UTC(2026, 9, 3, 12);

async function cleanup() {
  await db
    .delete(contactMessages)
    .where(like(contactMessages.id, `${prefix}%`));
  await db.delete(clickEvents).where(like(clickEvents.id, `${prefix}%`));
}
async function event(id: string, ago = 0, extra = {}) {
  await db.insert(clickEvents).values({
    id: `${prefix}${id}`,
    type: "cta",
    page: "/",
    createdAt: new Date(now - ago),
    ...extra,
  });
}
async function contact(id: string, ago = 0) {
  const timestamp = new Date(now - ago).toISOString();
  await db.insert(contactMessages).values({
    id: `${prefix}${id}`,
    source: "public_contact",
    category: "question",
    email: "metrics-contact@example.test",
    message: "Consulta ficticia para probar un agregado.",
    status: "new",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

beforeEach(async () => {
  await cleanup();
  mocks.requireAdmin.mockResolvedValue({
    email: "admin@example.test",
    session: {},
  });
  vi.spyOn(Date, "now").mockReturnValue(now);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

describe("lectura íntegra de métricas administrativas", () => {
  it("mantiene referidos y formularios en las tres ventanas con un único batch", async () => {
    await event("signup", 0, {
      type: "signup",
      utmSource: "whatsapp",
      utmCampaign: "referidos_profesionales",
    });
    await event("share", 0, { type: "professional_referral_share" });
    await event("email", 0, {
      type: "contact_email",
      label: "Contacto público · contact@example.test",
      page: "/contacto",
    });
    await contact("form");
    const batch = vi.spyOn(db, "batch");
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(batch).toHaveBeenCalledTimes(1);
    expect(batch.mock.calls[0][0]).toHaveLength(9);
    expect(isAdminMetrics(body)).toBe(true);
    if (!isAdminMetrics(body)) throw new Error("invalid test snapshot");
    expect(body).toMatchObject({ generatedAt: now, total: 3, last24: 3 });
    for (const window of body.windows) {
      expect(window).toMatchObject({
        total: 3,
        contactForms: 1,
        emailClicks: 1,
        referralShares: 1,
        referralSignups: 1,
        signups: 1,
      });
    }
  });

  it("respeta los límites temporales, excluye eventos futuros y marcadores de despliegue", async () => {
    await event("now");
    await event("24-boundary", day);
    await event("24-past", day + 1);
    await event("7-boundary", 7 * day);
    await event("7-past", 7 * day + 1);
    await event("30-boundary", 30 * day);
    await event("30-past", 30 * day + 1);
    await event("future", -1);
    await event("marker", 0, { label: "VERIF-DESPLIEGUE" });
    await contact("24-form", day);
    await contact("24-form-past", day + 1);
    await contact("future-form", -1);
    const data = await readAdminMetrics(now);
    expect(data.total).toBe(7);
    expect(data.windows.map((window) => window.total)).toEqual([2, 4, 6]);
    expect(data.windows.map((window) => window.contactForms)).toEqual([
      1, 2, 2,
    ]);
    expect(data.recent.map((row) => row.id)).not.toContain(`${prefix}future`);
    expect(data.recent.map((row) => row.id)).not.toContain(`${prefix}marker`);
  });

  it("un conjunto vacío válido devuelve ceros reales y tres ventanas completas", async () => {
    const data = await readAdminMetrics(now);
    expect(isAdminMetrics(data)).toBe(true);
    expect(data.total).toBe(0);
    expect(data.windows.map((window) => window.total)).toEqual([0, 0, 0]);
    expect(data.recent).toEqual([]);
  });

  it("acota grupos de alta cardinalidad sin recortar los totales", async () => {
    await db.insert(clickEvents).values(
      Array.from({ length: 50 }, (_, index) => ({
        id: `${prefix}group-${index}`,
        type: `custom-${index.toString().padStart(2, "0")}`,
        utmSource: `source-${index.toString().padStart(2, "0")}`,
        createdAt: new Date(now),
      })),
    );
    const data = await readAdminMetrics(now);
    expect(data.total).toBe(50);
    expect(data.last24).toBe(50);
    expect(data.bySource).toHaveLength(40);
    expect(data.byType).toHaveLength(40);
    expect(data.byCampaign).toHaveLength(20);
    expect(data.truncated).toMatchObject({
      bySource: true,
      byType: true,
      byCampaign: true,
    });
    expect(data.bySource[0]).toEqual({ label: "source-00", n: 1 });
    expect(data.recent).toHaveLength(15);
  });

  it("no consulta agregados si la autorización es denegada", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    const batch = vi.spyOn(db, "batch");
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ code: "not_authorized" });
    expect(batch).not.toHaveBeenCalled();
  });

  it("un fallo de BD devuelve 503 reintentable sin SQL ni datos inventados", async () => {
    vi.spyOn(db, "batch").mockRejectedValue(
      new Error("SQL sensitive-fixture@example.test"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await response.json();
    expect(body).toMatchObject({ code: "metrics_unavailable" });
    expect(body).not.toHaveProperty("total");
    expect(JSON.stringify(body)).not.toContain("sensitive-fixture");
    expect(log).toHaveBeenCalledWith("[admin_metrics] lectura no disponible", {
      stage: "query",
      kind: "query_failure",
      field: "none",
      group: "none",
      errorType: "Error",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive-fixture");
  });

  it.each([
    "missing",
    "negative",
    "nonfinite",
  ])("rechaza un agregado %s en lugar de sustituirlo por cero", async (variant) => {
    const original = db.batch.bind(db);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "batch").mockImplementation(async (...args) => {
      const rows = await original(...args);
      const invalidSummary = [
        {
          total:
            variant === "missing"
              ? undefined
              : variant === "negative"
                ? -1
                : Number.NaN,
          approved_pros: 0,
          in_person_pros: 0,
          requests: 0,
        },
      ];
      return [rows[0], invalidSummary, ...rows.slice(2)] as typeof rows;
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "metrics_unavailable",
    });
    expect(log).toHaveBeenCalledWith("[admin_metrics] lectura no disponible", {
      stage: "summary",
      kind: "invalid_count",
      field: "total",
      group: "none",
      errorType: "Error",
    });
  });

  it("marca el grupo y campo inválido sin registrar etiquetas ni su valor", async () => {
    const original = db.batch.bind(db);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "batch").mockImplementation(async (...args) => {
      const rows = await original(...args);
      return [
        rows[0],
        rows[1],
        [{ label: "private-fixture@example.test", n: "private-value" }],
        ...rows.slice(3),
      ] as typeof rows;
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(log).toHaveBeenCalledWith("[admin_metrics] lectura no disponible", {
      stage: "groups",
      kind: "invalid_count",
      field: "n",
      group: "bySource",
      errorType: "Error",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-fixture");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-value");
    expect(await response.json()).toEqual({
      error: "No se pudieron cargar las métricas. Inténtalo de nuevo.",
      code: "metrics_unavailable",
    });
  });

  it("una respuesta incompleta del batch se registra como estructura inválida", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "batch").mockResolvedValue(
      [] as unknown as Awaited<ReturnType<typeof db.batch>>,
    );
    expect((await GET()).status).toBe(503);
    expect(log).toHaveBeenCalledWith("[admin_metrics] lectura no disponible", {
      stage: "query",
      kind: "invalid_shape",
      field: "none",
      group: "none",
      errorType: "Error",
    });
  });
});
