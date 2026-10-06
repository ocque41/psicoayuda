import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdmissionActionForm } from "@/components/admission/action-form";
import { AdmissionBoard } from "@/components/admission/admission-board";
import { AdmissionConfiguration } from "@/components/admission/configuration";
import { AdmissionDetailDialog } from "@/components/admission/detail-dialog";
import {
  admissionHref,
  completedGates,
  formatAdmissionDate,
  moveAdmissionStage,
} from "@/components/admission/view-model";
import {
  type AdmissionActions,
  type AdmissionBoardData,
  type AdmissionDetail,
  defaultAdmissionStages,
} from "@/lib/admission/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

const action = vi.fn(async () => ({ ok: true, message: "Guardado." }));
const actions: AdmissionActions = {
  saveReview: action,
  saveScope: action,
  moveStage: action,
  publish: action,
  configure: action,
};
function detail(data: AdmissionBoardData): AdmissionDetail {
  if (!data.selected) throw new Error("La prueba requiere una ficha ficticia.");
  return data.selected;
}
function fixture(): AdmissionBoardData {
  const candidate = {
    professionalId: "professional-fixture",
    name: "Profesional de prueba",
    email: "admision@example.test",
    country: "Venezuela",
    licenseCountry: "Venezuela",
    stageId: "publication",
    revision: 3,
    profileRevision: "2026-10-04T08:00:00.000Z",
    updatedAt: "2026-10-04T08:00:00.000Z",
    hasDocument: true,
    gates: { identity: true, credentials: true, scope: true, interview: true },
    canPublish: true,
  };
  return {
    stages: defaultAdmissionStages.map((stage) => ({ ...stage })),
    configRevision: 2,
    candidates: [candidate],
    selected: {
      ...candidate,
      profile: {
        university: "Universidad de prueba",
        licenseNumber: "REGISTRO-PRUEBA",
        fpvNumber: null,
        fpvVerified: true,
        registrationType: "Registro de prueba",
        registrationDetail: null,
        conductAccepted: true,
      },
      evidence: {
        identity: "Cotejo mediante entrevista",
        credentials: "Consulta en registro profesional",
      },
      interview: {
        startsAt: "2026-10-04T15:00:00.000Z",
        localDateTime: "2026-10-04T11:00",
        timeZone: "America/Caracas",
        reference: "Entrevista de revisión completada",
        completed: true,
      },
      scopes: [
        {
          id: "scope-fixture",
          country: "Venezuela",
          reference: "Registro cotejado",
          expiresAt: "2027-03-01T23:59:59.999Z",
          reviewedAt: "2026-10-04T08:00:00.000Z",
          valid: true,
        },
      ],
      history: [
        {
          id: "event-fixture",
          createdAt: "2026-10-04T08:00:00.000Z",
          actorLabel: "Equipo de revisión",
          action: "review",
          summary: "Revisión guardada",
        },
      ],
      historyHasMore: true,
      historyPage: 2,
      publishBlockers: [],
    },
    canConfigure: true,
    limitedReviewer: true,
    page: 2,
    hasMore: true,
    query: "",
    stageFilter: "",
    stageCounts: {
      identity: 31,
      credentials: 12,
      scope: 8,
      interview: 4,
      publication: 2,
    },
  };
}

describe("admisión: tablero y revisión humana", () => {
  it("separa etapas con cifras completas, página acotada y permisos sin otros controles administrativos", () => {
    const data = fixture();
    data.selected = null;
    const html = renderToStaticMarkup(
      <AdmissionBoard data={data} actions={actions} />,
    );
    expect(html).toContain("31 profesionales en esta etapa");
    expect(html).toContain("1 profesional en esta página");
    expect(html).toContain(
      "Las cifras de las etapas incluyen todas las páginas.",
    );
    expect(html).toContain("limitado a nuevos profesionales pendientes");
    expect(html).toContain("4 de 4 revisiones");
    expect(html).toContain("Documento disponible");
    expect(html).not.toContain("REGISTRO-PRUEBA");
    expect(html).not.toContain("documento/professional-fixture");
    for (const forbidden of [
      "Borrar cuenta",
      "Impersonar",
      "Cobros",
      "Historia clínica",
    ])
      expect(html).not.toContain(forbidden);
  });

  it("muestra estados vacíos distintos y no ofrece configuración sin permiso", () => {
    const data = fixture();
    data.selected = null;
    data.candidates = [];
    data.canConfigure = false;
    const empty = renderToStaticMarkup(
      <AdmissionBoard data={data} actions={actions} />,
    );
    expect(empty).toContain("La bandeja de admisión está al día.");
    expect(empty).not.toContain("Ajustar etapas");
    data.query = "sin coincidencias";
    expect(
      renderToStaticMarkup(<AdmissionBoard data={data} actions={actions} />),
    ).toContain("No encontramos coincidencias.");
  });

  it("mantiene filtros y páginas al abrir una ficha, sin interpolar HTML o consultas", () => {
    const data = fixture();
    data.query = "nombre & otro";
    data.stageFilter = "identity";
    const href = admissionHref(data, {
      candidate: "id/con?otro=1",
      historyPage: 3,
    });
    const url = new URL(href, "https://nido.example.test");
    expect(url.pathname).toBe("/admin/admision");
    expect(url.searchParams.get("q")).toBe(data.query);
    expect(url.searchParams.get("candidato")).toBe("id/con?otro=1");
    expect(url.searchParams.get("pagina")).toBe("2");
    expect(url.searchParams.get("historial")).toBe("3");
    expect(url.searchParams.get("otro")).toBeNull();
  });

  it("escapa perfiles y referencias y mantiene los seis apartados sin una página larga", () => {
    const data = fixture();
    const candidate = detail(data);
    candidate.name = "<script>prueba</script>";
    candidate.evidence.identity = '<img src=x onerror="prueba">';
    const html = renderToStaticMarkup(
      <AdmissionDetailDialog
        data={data}
        candidate={candidate}
        actions={actions}
      />,
    );
    expect(html).toContain("&lt;script&gt;prueba&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html.match(/role="tab"/g)).toHaveLength(6);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(6);
    const panels = [
      ...html.matchAll(/<section[^>]*role="tabpanel"[^>]*>/g),
    ].map(([tag]) => tag);
    expect(panels.filter((tag) => !tag.includes("hidden="))).toHaveLength(1);
    expect(html).toContain(
      "La identidad, documentación y autorización de ejercicio requieren revisión humana.",
    );
  });

  it("envía revisión y entrevista completas con versiones, sin fingir un control de ámbito", () => {
    const data = fixture();
    const html = renderToStaticMarkup(
      <AdmissionDetailDialog
        data={data}
        candidate={detail(data)}
        actions={actions}
      />,
    );
    for (const name of [
      "professionalId",
      "revision",
      "profileRevision",
      "configRevision",
      "identityChecked",
      "identityReference",
      "credentialsChecked",
      "credentialsReference",
      "interviewLocal",
      "interviewTimeZone",
      "interviewReference",
      "interviewCompleted",
      "registryReference",
      "expiresAt",
      "checked",
    ])
      expect(html).toContain(`name="${name}"`);
    expect(html).not.toContain('name="scopeChecked"');
    expect(html).toContain("America/Caracas");
    expect(html).toContain("/admin/admision/documento/professional-fixture");
    expect(html).toContain("No se envía una invitación automáticamente.");
    expect(html).toContain("Compromiso de conducta");
  });

  it("permite completar la confirmación de publicar y sólo bloquea su botón antes de aceptarla", () => {
    const html = renderToStaticMarkup(
      <AdmissionActionForm action={action} submit="Publicar" submitDisabled>
        <input type="checkbox" name="confirm" />
      </AdmissionActionForm>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publicar<\/button>/);
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(html).not.toMatch(/<input[^>]*disabled/);
  });

  it("una ficha bloqueada explica lo que falta y no permite confirmar una publicación", () => {
    const data = fixture();
    const candidate = detail(data);
    candidate.canPublish = false;
    candidate.publishBlockers = ["Falta cotejar la identidad."];
    const html = renderToStaticMarkup(
      <AdmissionDetailDialog
        data={data}
        candidate={candidate}
        actions={actions}
      />,
    );
    expect(html).toContain("Falta cotejar la identidad.");
    const confirmInput = html.match(/<input[^>]*name="confirm"[^>]*>/)?.[0];
    expect(confirmInput).toContain('disabled=""');
    expect(html).not.toContain(
      "Los controles guardados permiten solicitar la publicación",
    );
  });

  it("preserva las etapas esenciales, exige motivo y permite extras sin prometer mover candidaturas", () => {
    const html = renderToStaticMarkup(
      <AdmissionConfiguration
        data={fixture()}
        action={action}
        onClose={() => {}}
      />,
    );
    expect(html.match(/Etapa esencial/g)).toHaveLength(5);
    expect(html).toContain('name="stagesJSON"');
    expect(html).toContain('name="configRevision"');
    expect(html).toContain(
      "Antes de quitar una etapa adicional, mueve sus candidaturas a otra.",
    );
    expect(html).not.toContain("Quitar etapa");
    expect(html).toContain("Motivo del ajuste");
  });

  it("el reordenamiento protege la publicación final y conserva IDs y flags esenciales", () => {
    const stages = defaultAdmissionStages.map((stage) => ({ ...stage }));
    expect(moveAdmissionStage(stages, 4, -1)).toBe(stages);
    expect(moveAdmissionStage(stages, 3, 1)).toBe(stages);
    expect(moveAdmissionStage(stages, 0, -1)).toBe(stages);
    const moved = moveAdmissionStage(stages, 0, 1);
    expect(moved.map((stage) => stage.id)).toEqual([
      "credentials",
      "identity",
      "scope",
      "interview",
      "publication",
    ]);
    expect(stages.map((stage) => stage.id)).toEqual(
      defaultAdmissionStages.map((stage) => stage.id),
    );
    expect(moved.every((stage) => stage.core)).toBe(true);
  });

  it("no convierte una fecha inválida o un ámbito ausente en una revisión confirmada", () => {
    expect(formatAdmissionDate("fecha falsa")).toBe("Fecha sin confirmar");
    expect(formatAdmissionDate("2026-10-04T10:00:00Z", "zona falsa")).toBe(
      "Fecha sin confirmar",
    );
    expect(
      completedGates({
        identity: true,
        credentials: true,
        scope: false,
        interview: false,
      }),
    ).toBe(2);
  });

  it("mantiene un listado de ámbitos compacto sin descartar su navegación", () => {
    const data = fixture();
    const candidate = detail(data);
    candidate.scopes = Array.from({ length: 12 }, (_, index) => ({
      ...candidate.scopes[0],
      id: `scope-${index}`,
      reference: `Referencia de prueba ${index}`,
    }));
    const html = renderToStaticMarkup(
      <AdmissionDetailDialog
        data={data}
        candidate={candidate}
        actions={actions}
        initialTab="scope"
        notice="Ámbito guardado."
      />,
    );
    expect(html).toContain("Referencia de prueba 4");
    expect(html).not.toContain("Referencia de prueba 5");
    expect(html).toContain("Página 1 de 3");
    expect(html).toContain("Páginas de ámbitos revisados");
    expect(html).toContain("Ámbito guardado.");
  });

  it("recupera referencias del historial como texto escapado y acotado", () => {
    const data = fixture();
    const candidate = detail(data);
    candidate.history[0].details = [
      "<script>referencia ficticia</script>",
      "Entrevista en America/Caracas",
      "x".repeat(500),
      "Referencia tercera",
      "Referencia cuarta",
      "Referencia quinta",
      "Detalle fuera del límite",
    ];
    const html = renderToStaticMarkup(
      <AdmissionDetailDialog
        data={data}
        candidate={candidate}
        actions={actions}
        initialTab="history"
      />,
    );
    expect(html).toContain("&lt;script&gt;referencia ficticia&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Entrevista en America/Caracas");
    expect(html).toContain("x".repeat(350));
    expect(html).not.toContain("x".repeat(351));
    expect(html).not.toContain("Detalle fuera del límite");
  });
});
