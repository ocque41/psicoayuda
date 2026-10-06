import type { Client } from "@libsql/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfessionalInvitation } from "@/lib/contact-messages";

const mocks = vi.hoisted(() => ({
  reviewer: vi.fn(),
  session: vi.fn(),
  professional: vi.fn(),
  query: vi.fn(),
  database: null as Client | null,
}));
vi.mock("@/lib/admission/access", () => ({
  requireAdmissionReviewer: mocks.reviewer,
}));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/practice/access", () => ({
  requirePracticeProfessional: mocks.professional,
}));
vi.mock("@/db", async () => {
  const { createClient } = await import("@libsql/client");
  const { drizzle } = await import("drizzle-orm/libsql");
  // Base efímera independiente: ninguna conexión al entorno de la aplicación.
  const client = createClient({ url: "file::memory:" });
  await client.execute(
    "CREATE TABLE professionals (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, status TEXT NOT NULL, non_clinical_helper INTEGER NOT NULL, registration_proof_doc TEXT, photo TEXT)",
  );
  await client.execute(
    "CREATE TABLE session (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)",
  );
  mocks.database = client;
  return {
    db: drizzle(client, {
      logger: { logQuery: (query, params) => mocks.query(query, params) },
    }),
  };
});
vi.mock("@/components/auth-panel", () => ({
  AuthPanel: ({ callbackURL }: { callbackURL: string }) => (
    <p data-login={callbackURL}>Entrada de cuenta ficticia</p>
  ),
}));
vi.mock("@/components/practice/nav", () => ({
  PracticeNav: () => <nav>Consulta profesional</nav>,
}));
vi.mock("@/components/professional-invitation-panel", () => ({
  ProfessionalInvitationPanel: (invitation: ProfessionalInvitation) => (
    <section data-invitation>
      <a href={invitation.registrationUrl}>Registro profesional</a>
      <p>{invitation.message}</p>
    </section>
  ),
}));

import AdminInvitationsPage, {
  dynamic as adminDynamic,
  metadata as adminMetadata,
} from "@/app/admin/invitaciones/page";
import ProfessionalInvitationsPage, {
  dynamic as proDynamic,
  metadata as proMetadata,
} from "@/app/pro/invitaciones/page";

beforeEach(async () => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue(null);
  mocks.reviewer.mockResolvedValue(null);
  await mocks.database?.execute("DELETE FROM professionals");
  await mocks.database?.execute("DELETE FROM session");
  await mocks.database?.execute({
    sql: "INSERT INTO professionals (id,user_id,status,non_clinical_helper,registration_proof_doc,photo) VALUES (?,?,?,?,?,?)",
    args: [
      "fictional-professional",
      "fictional-professional-user",
      "approved",
      0,
      "documento-ficticio".repeat(50000),
      "foto-ficticia",
    ],
  });
  await mocks.database?.execute({
    sql: "INSERT INTO session (id,user_id,expires_at) VALUES (?,?,?)",
    args: [
      "fictional-professional-sid",
      "fictional-professional-user",
      Date.now() + 3600000,
    ],
  });
});
afterAll(() => mocks.database?.close());
const currentProfessionalSession = () => ({
  user: { id: "fictional-professional-user" },
  session: {
    id: "fictional-professional-sid",
    expiresAt: new Date(Date.now() + 3600000),
  },
});
const adminPage = (query: Record<string, string | string[] | undefined> = {}) =>
  AdminInvitationsPage({ searchParams: Promise.resolve(query) });

describe("invitaciones de admisión", () => {
  it("el acceso anónimo abre el login propio sin preparar una invitación", async () => {
    const html = renderToStaticMarkup(await adminPage({ vista: "paola" }));
    expect(mocks.reviewer).toHaveBeenCalledOnce();
    expect(html).toContain('data-login="/admin/invitaciones?vista=paola"');
    expect(html).not.toContain("data-invitation");
  });

  it.each([
    {},
    { vista: "paola" },
  ])("el parámetro de vista no concede acceso a una cuenta sin rol: %j", async (query) => {
    mocks.session.mockResolvedValue({
      user: { id: "fictional-ordinary", email: "ordinary@example.invalid" },
    });
    const html = renderToStaticMarkup(await adminPage(query));
    expect(html).toContain("Esta cuenta no tiene acceso");
    expect(html).not.toContain("data-invitation");
    expect(html).not.toContain("data-login");
  });

  it("la revisora autorizada conserva el menú limitado y no introduce su identidad en el mensaje", async () => {
    mocks.reviewer.mockResolvedValue({
      userId: "fictional-reviewer",
      sessionId: "fictional-reviewer-sid",
      email: "reviewer@example.invalid",
      isAdmin: false,
    });
    const html = renderToStaticMarkup(await adminPage({ vista: "paola" }));
    expect(html).toContain("data-invitation");
    expect(html).toContain("Administración de psicólogos");
    expect(html).toContain('href="/pro/consulta"');
    expect(html).not.toContain('href="/admin/cuentas"');
    expect(html).not.toContain('href="/admin/export"');
    expect(html).not.toContain("Vista de Superadmin");
    expect(mocks.professional).not.toHaveBeenCalled();
  });

  it.each([
    "fictional-admin-one",
    "fictional-admin-two",
  ])("%s puede ver el rol de Paola con su actor real", async (userId) => {
    const actor = {
      userId,
      sessionId: `${userId}-sid`,
      email: `${userId}@example.invalid`,
      isAdmin: true,
    };
    mocks.reviewer.mockResolvedValue(actor);
    const html = renderToStaticMarkup(await adminPage({ vista: "paola" }));
    expect(html).toContain("data-invitation");
    expect(html).toContain(actor.email);
    expect(html).toContain("Sigues usando tu cuenta de Superadmin");
    expect(html).toContain('href="/admin/crm"');
    expect(html).not.toContain('href="/admin/cuentas"');
    expect(actor.isAdmin).toBe(true);
  });

  it("el superadmin conserva la navegación completa en su vista habitual", async () => {
    mocks.reviewer.mockResolvedValue({
      userId: "fictional-admin",
      sessionId: "fictional-admin-sid",
      email: "admin@example.invalid",
      isAdmin: true,
    });
    const html = renderToStaticMarkup(await adminPage());
    expect(html).toContain('href="/admin/cuentas"');
    expect(html).toContain('href="/admin/export"');
    expect(html).toContain("Vista de Paola");
  });
});

describe("invitaciones de la consulta", () => {
  it("el acceso anónimo presenta AuthPanel sin consultar un profesional ni servir invitaciones", async () => {
    const html = renderToStaticMarkup(await ProfessionalInvitationsPage());
    expect(html).toContain('data-login="/pro/invitaciones"');
    expect(html).not.toContain("data-invitation");
    expect(mocks.professional).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("un profesional aprobado de sesión viva puede invitar, sin enviar sus identificadores en la campaña", async () => {
    mocks.session.mockResolvedValue(currentProfessionalSession());
    mocks.professional.mockResolvedValue({ id: "fictional-professional" });
    const html = renderToStaticMarkup(await ProfessionalInvitationsPage());
    expect(mocks.professional).toHaveBeenCalledOnce();
    const [query, params] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(query.split(" from ")[0]).toBe(
      'select "professionals"."id", "professionals"."user_id", "session"."id", "session"."expires_at"',
    );
    expect(query).not.toMatch(/registration_proof_doc|photo/);
    expect(params).toContain("fictional-professional-sid");
    expect(params).toContain("fictional-professional-user");
    expect(params).toContain("fictional-professional");
    expect(html).toContain("data-invitation");
    expect(html).not.toContain("fictional-professional");
    expect(html).toContain("panel_profesional");
  });

  it.each([
    "DELETE FROM session",
    "UPDATE session SET user_id='fictional-other-user'",
    "UPDATE session SET id='fictional-other-sid'",
    "UPDATE session SET expires_at=0",
    "UPDATE professionals SET user_id='fictional-other-user'",
    "UPDATE professionals SET status='suspended'",
    "UPDATE professionals SET status='pending_verification'",
    "UPDATE professionals SET non_clinical_helper=1",
  ])("una revocación o cambio de permisos tras el guard previo se revalida dentro del SQL: %s", async (mutation) => {
    mocks.session.mockResolvedValue(currentProfessionalSession());
    mocks.professional.mockImplementation(async () => {
      await mocks.database?.execute(mutation);
      return { id: "fictional-professional" };
    });
    const html = renderToStaticMarkup(await ProfessionalInvitationsPage());
    expect(html).toContain("Comprueba tu acceso");
    expect(html).not.toContain("data-invitation");
    expect(mocks.query).toHaveBeenCalledOnce();
  });

  it("un identificador de profesional de otra cuenta no abre el apartado", async () => {
    mocks.session.mockResolvedValue(currentProfessionalSession());
    mocks.professional.mockResolvedValue({
      id: "fictional-other-professional",
    });
    const html = renderToStaticMarkup(await ProfessionalInvitationsPage());
    expect(html).toContain("Comprueba tu acceso");
    expect(html).not.toContain("data-invitation");
  });

  it.each([
    null,
    "invalid-date",
    new Date(0),
  ])("un SID ausente o una sesión caducada no consulta la ficha: %j", async (expiresAt) => {
    const current = currentProfessionalSession();
    mocks.session.mockResolvedValue({
      ...current,
      session:
        expiresAt === null ? undefined : { ...current.session, expiresAt },
    });
    mocks.professional.mockResolvedValue({ id: "fictional-professional" });
    const html = renderToStaticMarkup(await ProfessionalInvitationsPage());
    expect(html).toContain("Comprueba tu acceso");
    expect(html).not.toContain("data-invitation");
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("conserva el rechazo del guard profesional antes de preparar enlaces", async () => {
    mocks.session.mockResolvedValue({ user: { id: "pending" } });
    mocks.professional.mockRejectedValue(
      new Error("NEXT_REDIRECT:/pro/dashboard"),
    );
    await expect(ProfessionalInvitationsPage()).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("ambos apartados son dinámicos y no indexables", () => {
    expect(adminDynamic).toBe("force-dynamic");
    expect(proDynamic).toBe("force-dynamic");
    expect(adminMetadata.robots).toEqual({ index: false, follow: false });
    expect(proMetadata.robots).toEqual({ index: false, follow: false });
  });
});
