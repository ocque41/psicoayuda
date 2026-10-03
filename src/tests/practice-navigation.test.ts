import { describe, expect, it } from "vitest";
import {
  legacyPracticeHref,
  messageListHref,
  patientListHref,
} from "@/lib/practice/navigation";

describe("vistas independientes de la consulta", () => {
  it("pagina las fichas conservando nombre y seguimiento con caracteres literales", () => {
    const href = patientListHref(
      { q: "  María & 100%_  ", estado: "active" },
      2,
    );
    const url = new URL(href, "https://ejemplo.test");
    expect(url.pathname).toBe("/pro/pacientes");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: "María & 100%_",
      estado: "active",
      pagina: "2",
    });
    expect(url.hash).toBe("");
  });

  it("volver a la primera página conserva los filtros sin arrastrar parámetros de agenda", () => {
    expect(patientListHref({ q: "Alias", estado: "closed" }, 1)).toBe(
      "/pro/pacientes?q=Alias&estado=closed",
    );
    expect(patientListHref({ q: " ", estado: "inventado" })).toBe(
      "/pro/pacientes",
    );
  });

  it("acota el término a 80 caracteres y los límites de página", () => {
    const url = new URL(
      patientListHref({ q: "x".repeat(90) }, 99999),
      "https://ejemplo.test",
    );
    expect(url.searchParams.get("q")).toHaveLength(80);
    expect(url.searchParams.get("pagina")).toBe("10000");
    expect(messageListHref(Number.NaN)).toBe("/pro/mensajes");
    expect(messageListHref(-4)).toBe("/pro/mensajes");
    expect(messageListHref(2.9)).toBe("/pro/mensajes?pagina=2");
  });

  it("traslada favoritos de pacientes conservando solo sus filtros", () => {
    const href = legacyPracticeHref(
      "/pro/consulta",
      "?mes=2026-10&dia=2026-10-03&vista=agenda&q=Alias&estado=active&pagina=2&chats=3&solicitudes=4",
      "#pacientes",
    );
    expect(href).toBe("/pro/pacientes?q=Alias&estado=active&pagina=2");
  });

  it("traslada favoritos de chats con su propia página", () => {
    expect(
      legacyPracticeHref(
        "/pro/consulta",
        "?chats=3&pagina=2&q=Alias",
        "#chats",
      ),
    ).toBe("/pro/mensajes?pagina=3");
    expect(
      legacyPracticeHref("/pro/consulta", "?chats=inventado", "#chats"),
    ).toBe("/pro/mensajes");
  });

  it.each([
    "",
    "#calendario",
    "#solicitudes",
    "#inventado",
    "#https://otro.test",
  ])("respeta la agenda y no interpreta fragmentos desconocidos: %s", (hash) =>
    expect(legacyPracticeHref("/pro/consulta", "", hash)).toBeNull());

  it.each([
    "/pro/pacientes",
    "/pro/mensajes",
    "/mi",
    "/demo/consulta",
  ])("no redirige otras rutas: %s", (pathname) =>
    expect(legacyPracticeHref(pathname, "?pagina=2", "#pacientes")).toBeNull());
});
