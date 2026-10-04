import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MetricsDashboard,
  MetricsSnapshot,
} from "@/components/metrics-dashboard";
import type { AdminMetrics } from "@/shared/admin-metrics";

function snapshot(): AdminMetrics {
  return {
    generatedAt: 1_790_000_000_000,
    total: 210,
    last24: 31,
    approvedPros: 18,
    inPersonPros: 1,
    requests: 47,
    windows: (["24h", "7d", "30d"] as const).map((key, index) => ({
      key,
      label: ["Últimas 24h", "Últimos 7 días", "Últimos 30 días"][index],
      total: [31, 100, 210][index],
      professionalContacts: 15,
      allyContacts: 2,
      ctas: 13,
      leads: 1,
      signups: 3,
      emailClicks: 4,
      contactForms: 5,
      referralShares: 6,
      referralSignups: 7,
    })),
    bySource: [{ label: "directo", n: 10 }],
    byCampaign: [{ label: "directo / campaña", n: 8 }],
    byType: [{ label: "cta", n: 13 }],
    psychologists: [{ label: "Profesional de prueba", n: 15 }],
    aliados: [{ label: "Recurso de prueba", n: 2 }],
    contactEmails: [{ label: "/contacto · contacto@example.test", n: 4 }],
    recent: [
      {
        id: "event-0",
        type: "cta",
        label: "Ver catálogo",
        page: "/profesionales",
        source: null,
        ts: 1_789_999_000_000,
      },
    ],
    truncated: {
      bySource: false,
      byCampaign: false,
      byType: false,
      psychologists: false,
      aliados: false,
      contactEmails: false,
    },
  };
}

describe("panel compacto de métricas", () => {
  it("abre un único apartado y conserva las tres ventanas y todos los desgloses", () => {
    const html = renderToStaticMarkup(<MetricsSnapshot data={snapshot()} />);
    const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map(
      ([tag]) => tag,
    );
    expect(panels).toHaveLength(4);
    expect(panels.filter((tag) => !tag.includes("hidden="))).toHaveLength(1);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    for (const label of [
      "Últimas 24h",
      "Últimos 7 días",
      "Últimos 30 días",
      "Origen del tráfico",
      "Campañas",
      "Tipos de acción",
      "Aliados y recursos externos",
      "Correos de contacto",
    ])
      expect(html).toContain(label);
    for (const label of [
      "Contactos con profesionales",
      "Contactos con aliados",
      "Botones de acción",
      "Solicitudes",
      "Altas profesionales",
      "Clics en correos",
      "Formularios",
      "Intentos de compartir",
      "Altas por invitación",
    ])
      expect(html).toContain(label);
    expect(html).toContain("Los formularios se cuentan por separado.");
  });

  it("los grupos grandes y el historial se paginan sin descartar la lectura", () => {
    const data = snapshot();
    data.bySource = Array.from({ length: 20 }, (_, index) => ({
      label: `Fuente ${index}`,
      n: index,
    }));
    data.truncated.bySource = true;
    data.recent = Array.from({ length: 15 }, (_, index) => ({
      ...data.recent[0],
      id: `event-${index}`,
      label: `Acción ${index}`,
    }));
    const html = renderToStaticMarkup(<MetricsSnapshot data={data} />);
    expect(html).toContain("20 de 20 grupos");
    expect(html).toContain("El filtro busca en estos grupos");
    expect(html).toContain("Páginas del desglose");
    expect(html).toContain("Páginas de actividad reciente");
    expect(html).toContain("Acción 4");
    expect(html).not.toContain("Acción 5");
    expect(html).toContain("Fuente 7");
    expect(html).not.toContain("Fuente 8");
  });

  it("escapa etiquetas y códigos desconocidos sin tratar propiedades heredadas como tipos", () => {
    const data = snapshot();
    data.bySource[0].label = '<script>alert("fixture")</script>';
    data.recent[0].type = "__proto__";
    data.recent[0].label = '<img src=x onerror="fixture">';
    const html = renderToStaticMarkup(<MetricsSnapshot data={data} />);
    expect(html).toContain("Otro tipo de acción");
    expect(html).toContain("__proto__");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("mientras carga no convierte la ausencia de lectura en métricas con ceros", () => {
    const html = renderToStaticMarkup(<MetricsDashboard />);
    expect(html).toContain("Cargando métricas…");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Acciones registradas");
  });
});
