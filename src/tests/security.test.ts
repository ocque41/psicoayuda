import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { csvEscape, toCsvRow } from "@/lib/csv";
import nextConfig from "../../next.config";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Seguridad — CSV anti inyección de fórmulas (CWE-1236)", () => {
  it("prefija un apóstrofo a los disparadores de fórmula", () => {
    for (const payload of ["=1+1", "+1", "-1", "@SUM(A1)", '=HYPERLINK("x")']) {
      expect(csvEscape(payload).startsWith("\"'")).toBe(true);
    }
  });

  it("no toca texto normal salvo el entrecomillado", () => {
    expect(csvEscape("Caracas")).toBe('"Caracas"');
  });

  it("escapa comillas dobles internas", () => {
    expect(csvEscape('a"b')).toBe('"a""b"');
  });

  it("toCsvRow une celdas ya escapadas", () => {
    expect(toCsvRow(["=x", "y"])).toBe('"\'=x","y"');
  });
});

describe("Seguridad — secreto de auth con cierre en producción", () => {
  it("auth-secret falla en cerrado en producción sin secreto", () => {
    const src = read("src/lib/auth-secret.ts");
    expect(src).toContain("NODE_ENV");
    expect(src).toContain("phase-production-build");
    expect(src).toMatch(/throw new Error/);
  });

  it("auth.ts usa el resolvedor y orígenes de confianza, sin literal", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("getAuthSecret()");
    expect(auth).toContain("trustedOrigins");
    expect(auth).not.toContain('"nido-local-development-secret-change-me"');
  });

  it("limita la caché firmada a 60 segundos", () => {
    const auth = read("src/lib/auth.ts");
    expect(auth).toContain("cookieCache");
    expect(auth).toContain("maxAge: 60");
    expect(auth).toContain('strategy: "compact"');
  });

  it("consulta D1 directamente antes de operaciones sensibles", () => {
    const authServer = read("src/lib/auth-server.ts");
    expect(authServer).toContain("disableCookieCache: true");

    for (const file of [
      "src/lib/admin.ts",
      "src/app/actions-account.ts",
      "src/app/actions.ts",
      "src/app/actions-offers.ts",
      "src/app/c/[conversationId]/actions.ts",
    ]) {
      expect(read(file)).toContain("getFreshServerSession");
    }
  });
});

describe("Seguridad — cabeceras HTTP", () => {
  it("next.config declara las cabeceras de seguridad esperadas", async () => {
    const headers = (await nextConfig.headers?.()) ?? [];
    const keys = headers.flatMap((rule) => rule.headers.map((h) => h.key));
    for (const key of [
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "Permissions-Policy",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("la CSP bloquea el enmarcado (anti-clickjacking)", async () => {
    const headers = (await nextConfig.headers?.()) ?? [];
    const csp = headers[0]?.headers.find(
      (h) => h.key === "Content-Security-Policy",
    )?.value;
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe("Seguridad — aislamiento de datos", () => {
  it("matching proyecta columnas y no trae PII del profesional", () => {
    const src = read("src/lib/matching.ts");
    expect(src).not.toMatch(/\.select\(\)\s*\.from\(professionals\)/);
    expect(src).toContain("displayName: professionals.displayName");
    expect(src).not.toContain("email: professionals.email");
    expect(src).not.toContain("licenseNumber: professionals.licenseNumber");
  });

  it("el panel profesional filtra por estado de asignación", () => {
    const src = read("src/app/pro/dashboard/page.tsx");
    expect(src).toContain('eq(assignments.status, "assigned")');
  });

  it("el límite preventivo del Worker es 5.000 ms", () => {
    const wrangler = read("wrangler.jsonc");
    expect(wrangler).toMatch(/"cpu_ms":\s*5000/);
  });

  it("el export CSV escapa, acota filas y registra el egreso de PII", () => {
    const src = read("src/app/admin/export/route.ts");
    expect(src).toContain("toCsvRow");
    expect(src).toContain("MAX_EXPORT_ROWS");
    expect(src).toContain('action: "data_export"');
    expect(src).toContain("x-content-type-options");
  });

  it("cerrar, anonimizar y suspender liberan capacidad", () => {
    const actions = read("src/app/actions.ts");
    expect(actions).toContain("releaseAssignmentsForRequest");
    expect(actions).toContain("releaseProfessionalAssignments");
    const assignment = read("src/lib/assignment.ts");
    expect(assignment).toContain("max(0,");
  });
});
