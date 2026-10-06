import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  connection: null as null | {
    status: string;
    calendarId: string | null;
    autoSync: boolean;
    googleReminders: boolean;
    preferencesRevision: number;
    syncCursor: string | null;
    lastSyncedAt: string | null;
    errorCode: string | null;
  },
  configured: true,
  permitted: true,
}));
vi.mock("@/db", () => ({
  db: {
    query: {
      googleCalendarConnections: { findFirst: async () => fixture.connection },
    },
  },
}));
vi.mock("@/lib/calendar/config", () => ({
  googleCalendarConfig: () =>
    fixture.configured ? { clientId: "fixture-dedicada" } : null,
}));
vi.mock("@/lib/calendar/access", () => ({
  loadCalendarActor: async () =>
    fixture.permitted ? { timeZone: "America/Caracas" } : null,
}));
vi.mock("@/app/calendar-actions", () => ({
  connectCalendar: vi.fn(),
  disconnectCalendar: vi.fn(),
  saveGoogleReminders: vi.fn(),
  synchronizeCalendar: vi.fn(),
}));
vi.mock("@/components/practice/forms", () => ({
  PracticeForm: ({
    children,
    submit,
  }: {
    children?: ReactNode;
    submit: string;
  }) => (
    <form>
      {children}
      <button type="submit">{submit}</button>
    </form>
  ),
}));

import { CalendarConnectionPanel } from "@/components/calendar/connection-panel";

async function panel() {
  return renderToStaticMarkup(
    await CalendarConnectionPanel({
      userId: "cuenta-ficticia",
      audience: "pro",
    }),
  );
}
function connected() {
  fixture.connection = {
    status: "connected",
    calendarId: "calendario-ficticio",
    autoSync: false,
    googleReminders: false,
    preferencesRevision: 3,
    syncCursor: null,
    lastSyncedAt: null,
    errorCode: null,
  };
}
describe("Google Calendar: estados y próximos pasos del panel", () => {
  beforeEach(() => {
    fixture.connection = null;
    fixture.configured = true;
    fixture.permitted = true;
  });
  it("ofrece ICS sin fingir conexión cuando falta la configuración dedicada", async () => {
    fixture.configured = false;
    const html = await panel();
    expect(html).toContain("Sin conectar");
    expect(html).toContain("La conexión directa aún está en preparación");
    expect(html).toContain('href="/api/calendar/export?espacio=pro"');
    expect(html).not.toContain('name="consent"');
  });
  it("distingue permiso concedido de calendario preparado y explica los lotes", async () => {
    connected();
    if (fixture.connection) fixture.connection.calendarId = null;
    const html = await panel();
    expect(html).toContain("Permiso concedido");
    expect(html).toContain("Sincronizar ahora inicia un paso");
    expect(html).not.toContain("inmediatamente");
    expect(html).toContain("selecciona la que");
  });
  it("muestra cómo continuar un lote sin volver a iniciar OAuth", async () => {
    connected();
    if (fixture.connection)
      fixture.connection.syncCursor = '{"phase":"source","id":"fixture"}';
    const html = await panel();
    expect(html).toContain("Continuar sincronización");
    expect(html).not.toContain('name="consent"');
    expect(html).toContain('name="revision" value="3"');
  });
  it("abre el paso de retirada cuando Google requiere reconexión", async () => {
    connected();
    if (fixture.connection) {
      fixture.connection.status = "needs_reconnect";
      fixture.connection.errorCode = "reconnect";
    }
    const html = await panel();
    expect(html).toContain("Necesita reconexión");
    expect(html).toMatch(/<details[^>]* open=""/);
    expect(html).toContain("Desconectar de mi cuenta");
    expect(html).not.toContain("Guardar preferencias de Google");
  });
  it("explica una retirada pendiente sin habilitar sincronización ni perder el reintento", async () => {
    connected();
    if (fixture.connection) fixture.connection.status = "disconnecting";
    const html = await panel();
    expect(html).toContain("Desconexión pendiente");
    expect(html).toContain("Las actualizaciones están detenidas");
    expect(html).toContain("Completar desconexión");
    expect(html).not.toContain("Guardar preferencias de Google");
    expect(html).not.toContain(">Sincronizar ahora</button>");
  });
  it.each([
    "configured",
    "permitted",
  ] as const)("no anuncia actualizaciones activas si falta %s", async (condition) => {
    connected();
    fixture[condition] = false;
    const html = await panel();
    expect(html).toContain("Actualizaciones pausadas");
    expect(html).not.toContain("Guardar preferencias de Google");
    expect(html).not.toContain(">Conectado</span>");
  });
});
