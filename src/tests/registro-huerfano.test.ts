import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { account, auditLogs, professionals, session, user } from "@/db/schema";
import { reclamarUsuarioHuerfano } from "@/lib/account";

const ahora = new Date();
const iso = ahora.toISOString();
const luego = new Date(ahora.getTime() + 3_600_000);

const P = "test-huerfano";
const id = {
  huerfano: `${P}-puro`,
  conCredencial: `${P}-con-credencial`,
  cuenta: `${P}-cuenta`,
  conSesion: `${P}-con-sesion`,
  sesion: `${P}-sesion`,
  conPerfil: `${P}-con-perfil`,
  perfil: `${P}-perfil`,
};

// Idempotente: deja la base como estaba aunque un run anterior fallara a medias.
async function limpiar() {
  await db.delete(professionals).where(eq(professionals.id, id.perfil));
  await db.delete(session).where(eq(session.id, id.sesion));
  await db.delete(account).where(eq(account.id, id.cuenta));
  for (const uid of [
    id.huerfano,
    id.conCredencial,
    id.conSesion,
    id.conPerfil,
  ]) {
    await db.delete(user).where(eq(user.id, uid));
    await db.delete(auditLogs).where(eq(auditLogs.entityId, uid));
  }
}

describe("reclamarUsuarioHuerfano", () => {
  beforeAll(async () => {
    await limpiar();
    await db.insert(user).values([
      { id: id.huerfano, name: "Huérfana", email: `${id.huerfano}@test.local` },
      {
        id: id.conCredencial,
        name: "Con credencial",
        email: `${id.conCredencial}@test.local`,
      },
      {
        id: id.conSesion,
        name: "Con sesión",
        email: `${id.conSesion}@test.local`,
      },
      {
        id: id.conPerfil,
        name: "Con perfil",
        email: `${id.conPerfil}@test.local`,
      },
    ]);
    await db.insert(account).values({
      id: id.cuenta,
      accountId: id.conCredencial,
      providerId: "credential",
      userId: id.conCredencial,
    });
    await db.insert(session).values({
      id: id.sesion,
      token: `${id.sesion}-token`,
      expiresAt: luego,
      userId: id.conSesion,
    });
    await db.insert(professionals).values({
      id: id.perfil,
      userId: id.conPerfil,
      email: `${id.perfil}@test.local`,
      fullName: "Con Perfil Pro",
      languages: JSON.stringify(["es"]),
      supportAreas: JSON.stringify(["duelo"]),
      createdAt: iso,
      updatedAt: iso,
    });
  });

  afterAll(limpiar);

  it("repara un huérfano puro (sin credencial, sesión ni perfil) y deja audit log", async () => {
    // El correo llega con mayúsculas y espacios: debe normalizar.
    const reparado = await reclamarUsuarioHuerfano(
      `  ${id.huerfano.toUpperCase()}@TEST.LOCAL `,
    );
    expect(reparado).toBe(true);
    const fila = await db.query.user.findFirst({
      where: eq(user.id, id.huerfano),
    });
    expect(fila).toBeUndefined();
    const log = await db.query.auditLogs.findFirst({
      where: eq(auditLogs.entityId, id.huerfano),
    });
    expect(log?.action).toBe("user_orphan_reclaimed");
  });

  it("NO toca una cuenta con credencial", async () => {
    const reparado = await reclamarUsuarioHuerfano(
      `${id.conCredencial}@test.local`,
    );
    expect(reparado).toBe(false);
    const fila = await db.query.user.findFirst({
      where: eq(user.id, id.conCredencial),
    });
    expect(fila).toBeDefined();
  });

  it("NO toca una cuenta con sesión activa", async () => {
    const reparado = await reclamarUsuarioHuerfano(
      `${id.conSesion}@test.local`,
    );
    expect(reparado).toBe(false);
  });

  it("NO toca una cuenta con perfil profesional", async () => {
    const reparado = await reclamarUsuarioHuerfano(
      `${id.conPerfil}@test.local`,
    );
    expect(reparado).toBe(false);
  });

  it("correo desconocido o vacío: no repara nada", async () => {
    await expect(
      reclamarUsuarioHuerfano("nadie-con-este-correo@test.local"),
    ).resolves.toBe(false);
    await expect(reclamarUsuarioHuerfano("   ")).resolves.toBe(false);
  });
});
