import { eq, like } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { sendPatientVerification } from "@/app/mi/actions";
import { db } from "@/db";
import { account, auditLogs, session, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  session: vi.fn(),
  headers: vi.fn(),
}));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.send }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: async () => ({
    get: () => undefined,
    getAll: () => [],
    set: vi.fn(),
  }),
}));

const P = "test-auth-email-delivery";
const owner = `${P}-owner`;
const email = `${owner}@example.test`;
const safeMessage = "No pudimos enviar el correo. Vuelve a intentarlo.";
const rawDetail = "resend 403: private-ficticia@example.test token=ficticio";
const origin = String(auth.options.baseURL);
let authenticatedHeaders: Headers;
const fakeUser = {
  id: owner,
  name: "Cuenta ficticia",
  email,
  emailVerified: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const fakeUrl = `${origin}/api/auth/verify-email?token=ficticio`;
const hooks = [
  {
    name: "restablecer contraseña",
    invoke: () =>
      auth.options.emailAndPassword.sendResetPassword({
        user: fakeUser,
        url: fakeUrl,
        token: "ficticio",
      }),
  },
  {
    name: "verificar correo",
    invoke: () =>
      auth.options.emailVerification.sendVerificationEmail({
        user: fakeUser,
        url: fakeUrl,
        token: "ficticio",
      }),
  },
  {
    name: "confirmar cambio de correo",
    invoke: () =>
      auth.options.user.changeEmail.sendChangeEmailConfirmation({
        user: fakeUser,
        newEmail: `${P}-new@example.test`,
        url: fakeUrl,
        token: "ficticio",
      }),
  },
];

async function cleanup() {
  await db.delete(verification).where(eq(verification.value, owner));
  await db.delete(auditLogs).where(eq(auditLogs.entityId, owner));
  await db.delete(session).where(like(session.userId, `${P}%`));
  await db.delete(account).where(like(account.userId, `${P}%`));
  await db.delete(user).where(like(user.id, `${P}%`));
  await db.delete(user).where(like(user.email, `${P}%`));
}

describe("aceptación real y errores seguros de correos de acceso", () => {
  beforeAll(async () => {
    await cleanup();
    const response = await auth.api.signUpEmail({
      body: {
        email,
        name: "Cuenta ficticia",
        password: "Clave-ficticia-prueba-42",
      },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    const created = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    if (!created?.id) throw new Error("Falta la cuenta ficticia de prueba.");
    // El usuario lo genera Better Auth. Conservamos ese identificador real para
    // las acciones y dejamos owner solo como fixture de los hooks directos.
    mocks.session.mockResolvedValue({ user: { ...created } });
    authenticatedHeaders = new Headers({
      cookie: response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
      origin,
    });
    mocks.headers.mockResolvedValue(authenticatedHeaders);
  });
  beforeEach(() => {
    mocks.send.mockReset();
  });
  afterAll(async () => {
    const created = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    if (created?.id) {
      await db.delete(verification).where(eq(verification.value, created.id));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, created.id));
      await db.delete(session).where(eq(session.userId, created.id));
      await db.delete(account).where(eq(account.userId, created.id));
    }
    await cleanup();
  });

  describe.each(hooks)("$name", ({ invoke }) => {
    it("resuelve únicamente si el proveedor acepta el envío", async () => {
      mocks.send.mockResolvedValue({ ok: true, id: "ficticio" });
      await expect(invoke()).resolves.toBeUndefined();
      expect(mocks.send).toHaveBeenCalledOnce();
    });
    it("propaga rechazo sin detalles del proveedor", async () => {
      mocks.send.mockResolvedValue({ ok: false, error: rawDetail });
      await expect(invoke()).rejects.toMatchObject({
        body: { code: "AUTH_EMAIL_UNAVAILABLE", message: safeMessage },
      });
    });
    it("no declara enviado un correo sin configuración", async () => {
      mocks.send.mockResolvedValue({ ok: false, skipped: true });
      await expect(invoke()).rejects.toThrow(safeMessage);
    });
    it("sanea excepciones inesperadas y no conserva su causa", async () => {
      mocks.send.mockImplementation(() => {
        throw new Error(rawDetail);
      });
      let observed:
        | { safe: boolean; raw: boolean; hasCause: boolean }
        | undefined;
      try {
        await invoke();
      } catch (error) {
        observed = {
          safe: (error as Error).message === safeMessage,
          raw: String(error).includes(rawDetail),
          hasCause: (error as Error).cause !== undefined,
        };
      }
      expect(observed).toEqual({ safe: true, raw: false, hasCause: false });
    });
  });

  it("la acción autenticada de verificación no anuncia un envío rechazado", async () => {
    mocks.send.mockResolvedValue({ ok: false, error: rawDetail });
    const result = await sendPatientVerification(
      { ok: false, message: "" },
      new FormData(),
    );
    expect(result?.ok).toBe(false);
    expect(result?.message).toContain("No pudimos enviar");
    expect(result?.message).not.toContain(rawDetail);
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it.each([
    false,
    true,
  ])("change-email no devuelve éxito al fallar el envío (correo verificado: %s)", async (verified) => {
    await db
      .update(user)
      .set({ emailVerified: verified })
      .where(eq(user.email, email));
    mocks.send.mockResolvedValue({ ok: false, error: rawDetail });
    const response = await auth.api.changeEmail({
      body: { newEmail: `${P}-new@example.test`, callbackURL: "/mi/ajustes" },
      headers: authenticatedHeaders,
      asResponse: true,
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "AUTH_EMAIL_UNAVAILABLE",
      message: safeMessage,
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(
      (await db.query.user.findFirst({ where: eq(user.email, email) }))?.email,
    ).toBe(email);
  });

  it("change-email confirma la solicitud si el proveedor acepta el correo", async () => {
    mocks.send.mockResolvedValue({ ok: true, id: "ficticio" });
    const response = await auth.api.changeEmail({
      body: { newEmail: `${P}-new@example.test`, callbackURL: "/mi/ajustes" },
      headers: authenticatedHeaders,
      asResponse: true,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: true });
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it("no redirige como enviado si falla el segundo correo del cambio", async () => {
    mocks.send.mockResolvedValue({ ok: true, id: "ficticio" });
    const requested = await auth.api.changeEmail({
      body: { newEmail: `${P}-new@example.test`, callbackURL: "/mi/ajustes" },
      headers: authenticatedHeaders,
      asResponse: true,
    });
    expect(requested.status).toBe(200);
    const token = String(mocks.send.mock.calls[0][0].text).match(
      /[?&]token=([A-Za-z0-9_.-]+)/,
    )?.[1];
    if (!token) throw new Error("Falta el enlace ficticio de prueba.");
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ ok: false, error: rawDetail });
    const failed = await auth.api.verifyEmail({
      query: { token, callbackURL: "/mi/ajustes" },
      headers: authenticatedHeaders,
      asResponse: true,
    });
    expect(failed.status).toBe(503);
    expect(failed.headers.get("location")).toBeNull();
    expect(await failed.json()).toEqual({
      code: "AUTH_EMAIL_UNAVAILABLE",
      message: safeMessage,
    });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(
      (await db.query.user.findFirst({ where: eq(user.email, email) }))?.email,
    ).toBe(email);
    // El mismo enlace puede reintentarse sin haber cambiado aún la dirección.
    mocks.send.mockResolvedValue({ ok: true, id: "ficticio" });
    const retried = await auth.api.verifyEmail({
      query: { token, callbackURL: "/mi/ajustes" },
      headers: authenticatedHeaders,
      asResponse: true,
    });
    expect(retried.status).toBe(302);
    expect(retried.headers.get("location")).toBe("/mi/ajustes");
  });

  it("no modifica la espera del contexto de autenticación compartido", async () => {
    const context = await auth.$context;
    const originalWait = context.runInBackgroundOrAwait;
    mocks.send.mockResolvedValue({ ok: false, skipped: true });
    await auth.api.changeEmail({
      body: { newEmail: `${P}-new@example.test` },
      headers: authenticatedHeaders,
      asResponse: true,
    });
    expect((await auth.$context).runInBackgroundOrAwait).toBe(originalWait);
  });

  it("reset público conserva la misma respuesta para cuenta existente o ausente", async () => {
    mocks.send.mockResolvedValue({ ok: false, error: rawDetail });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const existing = await auth.api.requestPasswordReset({
        body: { email, redirectTo: "/pro/restablecer" },
        asResponse: true,
      });
      const absent = await auth.api.requestPasswordReset({
        body: {
          email: `${P}-absent@example.test`,
          redirectTo: "/pro/restablecer",
        },
        asResponse: true,
      });
      expect(existing.status).toBe(200);
      expect(absent.status).toBe(200);
      expect(await existing.json()).toEqual(await absent.json());
      expect(mocks.send).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
      warning.mockRestore();
    }
  });

  it("verificación pública conserva la respuesta neutra aunque falle el proveedor", async () => {
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.email, email));
    mocks.send.mockResolvedValue({ ok: false, error: rawDetail });
    const existing = await auth.api.sendVerificationEmail({
      body: { email },
      asResponse: true,
    });
    const absent = await auth.api.sendVerificationEmail({
      body: { email: `${P}-absent@example.test` },
      asResponse: true,
    });
    expect(existing.status).toBe(200);
    expect(absent.status).toBe(200);
    expect(await existing.json()).toEqual(await absent.json());
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
