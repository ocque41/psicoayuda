import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { practiceEntryDestination } from "@/app/demo/consulta/destination";
import { PracticeGuide } from "@/components/practice/practice-guide";

const route = vi.hoisted(() => ({ pathname: "/pro/consulta" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

describe("entrada a la consulta real", () => {
  it.each([
    ["#demo-home", "/pro/consulta"],
    ["#demo-agenda", "/pro/consulta"],
    ["#demo-pacientes", "/pro/pacientes"],
    ["#demo-notas", "/pro/pacientes"],
    ["#demo-mensajes", "/pro/mensajes"],
    ["#chats", "/pro/mensajes"],
    ["#demo-cobros", "/pro/cobros"],
    ["#demo-recordatorios", "/pro/ajustes#reminders-professional"],
    ["#recordatorios-activar", "/pro/ajustes#reminders-professional"],
    ["#ajustes", "/pro/ajustes#reminders-professional"],
    ["#demo-cierre", "/pro/consulta"],
  ])("conserva el destino de %s sin una ficha inventada", (hash, expected) => {
    expect(practiceEntryDestination(hash)).toBe(expected);
  });

  it.each([
    "",
    "#https://example.com",
    "#//example.com",
    "#demo-notas/ana",
    "#pacientes/ana",
  ])("limita el destino de %s a la agenda propia", (hash) => {
    expect(practiceEntryDestination(hash)).toBe("/pro/consulta");
  });
});

describe("guía de espacios reales", () => {
  beforeEach(() => {
    route.pathname = "/pro/consulta";
  });

  it.each([
    "/pro/consulta",
    "/pro/pacientes",
    "/pro/mensajes",
    "/pro/cobros",
    "/pro/ajustes",
  ])("ofrece primeros pasos en %s sin precisar datos de pacientes", (pathname) => {
    route.pathname = pathname;
    const html = renderToStaticMarkup(<PracticeGuide />);
    expect(html).toContain("Conocer este espacio con el pajarito");
    expect(html).toContain('href="/pro/pacientes#crear-paciente"');
    expect(html).not.toContain("/demo/consulta");
    expect(html).not.toContain("<form");
  });

  it("abre secciones de la ficha actual sin inventar sesión ni perder filtros", () => {
    route.pathname = "/pro/pacientes/ficha-propia";
    const html = renderToStaticMarkup(<PracticeGuide />);
    expect(html).toContain('href="#sesiones"');
    expect(html).toContain('href="#notas"');
    expect(html).not.toContain("notaSesion=");
  });

  it.each([
    "/mi",
    "/pro/dashboard",
    "/pro/onboarding",
    "/pro/plan",
    "/pro/pacientes/ficha-propia/cobros/recibo",
    "/profesionales",
  ])("no muestra el recorrido clínico fuera de su ámbito: %s", (pathname) => {
    route.pathname = pathname;
    expect(renderToStaticMarkup(<PracticeGuide />)).toBe("");
  });
});
