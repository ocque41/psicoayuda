import { describe, expect, it } from "vitest";
import {
  calendarDay,
  calendarHref,
  calendarMonth,
  calendarView,
  shiftCalendarMonth,
} from "@/lib/practice/calendar";

const fallback = "2026-10";

describe("contexto validado del calendario", () => {
  it.each([
    undefined,
    null,
    "",
    "2026-00",
    "2026-13",
    "0000-10",
    "2026-1",
    ["2026-10"],
    "texto",
  ])("usa el mes de la zona local para un parámetro inválido: %j", (value) =>
    expect(calendarMonth(value, fallback)).toBe(fallback));

  it("conserva meses válidos sin interpretar sus valores como fechas locales", () => {
    expect(calendarMonth("2024-02", fallback)).toBe("2024-02");
    expect(calendarMonth("0001-01", fallback)).toBe("0001-01");
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-02-00",
    "2026-02-03T12:00",
    "2026-03-03",
    "texto",
  ])("descarta un día imposible o ajeno al mes: %s", (value) =>
    expect(calendarDay(value, "2026-02")).toBeNull());

  it("acepta el día bisiesto y sólo las dos vistas conocidas", () => {
    expect(calendarDay("2024-02-29", "2024-02")).toBe("2024-02-29");
    expect(calendarView("agenda")).toBe("agenda");
    expect(calendarView("mes")).toBe("mes");
    expect(calendarView("texto")).toBe("mes");
    expect(calendarView(["agenda"])).toBe("mes");
  });

  it("navega entre años sin normalizar los años bajos a 1900", () => {
    expect(shiftCalendarMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftCalendarMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftCalendarMonth("0001-01", 1)).toBe("0001-02");
    expect(shiftCalendarMonth("0001-01", -1)).toBeNull();
    expect(shiftCalendarMonth("9999-12", 1)).toBeNull();
  });
});

describe("enlaces que conservan la agenda", () => {
  it("cambia el día sin perder vista, páginas ni filtros existentes", () => {
    const href = calendarHref(
      "/pro/consulta",
      "mes=2026-10&vista=agenda&pagina=2&chats=3&solicitudes=4&solicitudes_estado=all",
      fallback,
      { dia: "2026-10-03" },
    );
    const url = new URL(href, "https://ejemplo.test");
    expect(url.searchParams.get("dia")).toBe("2026-10-03");
    expect(url.searchParams.get("vista")).toBe("agenda");
    expect(url.searchParams.get("pagina")).toBe("2");
    expect(url.searchParams.get("chats")).toBe("3");
    expect(url.searchParams.get("solicitudes")).toBe("4");
    expect(url.searchParams.get("solicitudes_estado")).toBe("all");
    expect(url.hash).toBe("#calendario");
  });

  it("cambiar de mes quita un día incompatible y mantiene Agenda", () => {
    const href = calendarHref(
      "/mi/calendario",
      "mes=2026-10&dia=2026-10-03&vista=agenda&pagina=2&solicitudes=3",
      fallback,
      { mes: "2026-11" },
    );
    const params = new URL(href, "https://ejemplo.test").searchParams;
    expect(params.get("mes")).toBe("2026-11");
    expect(params.has("dia")).toBe(false);
    expect(params.get("vista")).toBe("agenda");
    expect(params.get("solicitudes")).toBe("3");
  });

  it.each([
    "pagina",
    "chats",
    "solicitudes",
  ] as const)("paginar %s sólo cambia ese listado y conserva día y vista", (key) => {
    const href = calendarHref(
      "/pro/consulta",
      "mes=2026-10&dia=2026-10-03&vista=agenda&pagina=2&chats=3&solicitudes=4",
      fallback,
      { [key]: 5 },
      key === "pagina" ? "pacientes" : key,
    );
    const url = new URL(href, "https://ejemplo.test");
    expect(url.searchParams.get("dia")).toBe("2026-10-03");
    expect(url.searchParams.get("vista")).toBe("agenda");
    for (const [other, value] of Object.entries({
      pagina: "2",
      chats: "3",
      solicitudes: "4",
    }))
      expect(url.searchParams.get(other)).toBe(other === key ? "5" : value);
    expect(url.hash).toBe(key === "pagina" ? "#pacientes" : `#${key}`);
  });

  it("Ver el mes retira el día y cambiar de vista no modifica las páginas", () => {
    const href = calendarHref(
      "/mi/calendario",
      "mes=2026-10&dia=2026-10-03&vista=agenda&pagina=2&solicitudes=3",
      fallback,
      { dia: null, vista: "mes" },
      "",
    );
    const url = new URL(href, "https://ejemplo.test");
    expect(url.searchParams.has("dia")).toBe(false);
    expect(url.searchParams.get("vista")).toBe("mes");
    expect(url.searchParams.get("pagina")).toBe("2");
    expect(url.searchParams.get("solicitudes")).toBe("3");
    expect(url.hash).toBe("");
  });

  it("normaliza valores inválidos y acota las páginas sin incluir nuevos campos", () => {
    const href = calendarHref(
      "/mi/calendario",
      "mes=no&dia=2026-10-99&vista=no&pagina=no&solicitudes=99999",
      fallback,
    );
    const url = new URL(href, "https://ejemplo.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mes: fallback,
      vista: "mes",
      pagina: "1",
      solicitudes: "10000",
    });
  });
});
