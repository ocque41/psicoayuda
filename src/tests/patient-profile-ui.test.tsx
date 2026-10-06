import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatientProfileEditor } from "@/components/practice/patient-profile-editor";
import { PatientProfileFields } from "@/components/practice/patient-profile-fields";
import { emptyPatientProfile } from "@/lib/practice/patient-profile-fields-model";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/app/pro/pacientes/[patientId]/profile-actions", () => ({
  savePatientProfile: mocks.save,
}));

afterEach(() => vi.useRealTimers());

describe("campos privados opcionales de la ficha", () => {
  it("deja la ampliación cerrada y no exige datos clínicos para crear la ficha", () => {
    const html = renderToStaticMarkup(<PatientProfileFields collapsible />);
    expect(html).toMatch(/^<details\b/);
    expect(html).not.toContain('open=""');
    expect(html).not.toContain('required=""');
    expect(html).toContain("Datos adicionales (opcionales)");
    expect(html).toContain('value=""');
  });

  it("desactiva autofill y correctores externos en el motivo y las notas", () => {
    const html = renderToStaticMarkup(<PatientProfileFields />);
    for (const name of ["consultationReason", "generalNote"]) {
      const textarea = html.match(
        new RegExp(`<textarea[^>]+name="${name}"[^>]*>`),
      )?.[0];
      expect(textarea).toContain('autoComplete="off"');
      expect(textarea).toContain('spellCheck="false"');
    }
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain('maxLength="12000"');
    expect(html).toContain("Notas por sesión");
  });

  it.each([
    ["America/Caracas", "2026-10-05"],
    ["Pacific/Kiritimati", "2026-10-06"],
    ["UTC", "2026-10-06"],
  ])("el límite de nacimiento usa el día local de %s", (timeZone, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T01:30:00.000Z"));
    const html = renderToStaticMarkup(
      <PatientProfileFields timeZone={timeZone} />,
    );
    expect(html).toContain(`max="${expected}"`);
  });

  it("no rompe una ficha histórica con una zona no reconocida por el navegador", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T01:30:00.000Z"));
    const html = renderToStaticMarkup(
      <PatientProfileFields timeZone="Zona antigua" />,
    );
    expect(html).toContain('max="2026-10-06"');
  });

  it("escapa el contenido privado al renderizar y conserva los valores originales", () => {
    const html = renderToStaticMarkup(
      <PatientProfileFields
        content={{
          ...emptyPatientProfile,
          consultationReason: '<script>alert("ficticio")</script>',
          generalNote: "Información ficticia & seguimiento",
        }}
      />,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Información ficticia &amp; seguimiento");
  });
});

describe("editor privado y revisión de la ficha", () => {
  it("impide reemplazar un registro que no se puede abrir", () => {
    const html = renderToStaticMarkup(
      <PatientProfileEditor
        patientId="ficha-ficticia"
        timeZone="UTC"
        profile={{
          status: "unavailable",
          content: {
            ...emptyPatientProfile,
            generalNote: "Texto ficticio que no se debe exponer",
          },
          revision: 3,
        }}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("El registro se conserva");
    expect(html).not.toContain("Texto ficticio que no se debe exponer");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<textarea");
  });

  it("transporta la revisión y exige autorización al guardar sin mezclar notas de sesión", () => {
    const html = renderToStaticMarkup(
      <PatientProfileEditor
        patientId="ficha-ficticia"
        timeZone="UTC"
        profile={{
          status: "ready",
          content: emptyPatientProfile,
          revision: 4,
        }}
      />,
    );
    expect(html).toContain('name="revision" value="4"');
    expect(html).toMatch(
      /<input(?=[^>]*name="profileConsent")(?=[^>]*required="")[^>]*>/,
    );
    expect(html).toContain("Guardar datos de la ficha");
    expect(html).not.toContain('name="appointmentId"');
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
