import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, professionals, user } from "@/db/schema";
import {
  isCredentialChangeRateLimited,
  logCredentialAudit,
  syncProfessionalEmailOnUserUpdate,
} from "@/lib/credentials";

const now = new Date();
const iso = now.toISOString();

const P = "test-cred";
const id = {
  userFollows: `${P}-user-follows`,
  proFollows: `${P}-pro-follows`,
  userCustom: `${P}-user-custom`,
  proCustom: `${P}-pro-custom`,
  userSolo: `${P}-user-solo`,
};

const emails = {
  before: "ana-cred@test.local",
  after: "nueva-cred@test.local",
  custom: "coord-cred@test.local",
  rateLimit: "rate-cred@test.local",
};

async function cleanup() {
  await db
    .delete(professionals)
    .where(inArray(professionals.id, [id.proFollows, id.proCustom]));
  await db
    .delete(user)
    .where(inArray(user.id, [id.userFollows, id.userCustom, id.userSolo]));
  await db
    .delete(auditLogs)
    .where(
      inArray(auditLogs.entityId, [
        id.proFollows,
        id.proCustom,
        id.userFollows,
        id.userSolo,
      ]),
    );
  await db.delete(auditLogs).where(eq(auditLogs.actorEmail, emails.rateLimit));
}

describe("syncProfessionalEmailOnUserUpdate", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insert(user).values([
      { id: id.userFollows, name: "Ana", email: emails.before },
      { id: id.userCustom, name: "Bea", email: "bea-cred@test.local" },
      { id: id.userSolo, name: "Solo", email: "solo-cred@test.local" },
    ]);
    await db.insert(professionals).values([
      {
        id: id.proFollows,
        userId: id.userFollows,
        email: emails.before,
        contactEmail: emails.before,
        fullName: "Ana Pérez",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo"]),
        createdAt: iso,
        updatedAt: iso,
      },
      {
        id: id.proCustom,
        userId: id.userCustom,
        email: "bea-cred@test.local",
        contactEmail: emails.custom,
        fullName: "Bea Gómez",
        languages: JSON.stringify(["es"]),
        supportAreas: JSON.stringify(["duelo"]),
        createdAt: iso,
        updatedAt: iso,
      },
    ]);
  });

  afterAll(cleanup);

  it("sincroniza el correo del perfil y mueve el de coordinación si lo seguía", async () => {
    await syncProfessionalEmailOnUserUpdate({
      id: id.userFollows,
      email: emails.after,
    });
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, id.proFollows),
    });
    expect(pro?.email).toBe(emails.after);
    expect(pro?.contactEmail).toBe(emails.after);
  });

  it("respeta un correo de coordinación elegido a propósito", async () => {
    await syncProfessionalEmailOnUserUpdate({
      id: id.userCustom,
      email: "bea-nueva@test.local",
    });
    const pro = await db.query.professionals.findFirst({
      where: eq(professionals.id, id.proCustom),
    });
    expect(pro?.email).toBe("bea-nueva@test.local");
    expect(pro?.contactEmail).toBe(emails.custom);
  });

  it("deja rastro de auditoría del cambio completado", async () => {
    const logs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.entityId, id.proFollows),
    });
    expect(logs.some((log) => log.action === "email_change")).toBe(true);
  });

  it("es un no-op si la cuenta no tiene perfil profesional", async () => {
    await expect(
      syncProfessionalEmailOnUserUpdate({
        id: id.userSolo,
        email: "sin-perfil@test.local",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("isCredentialChangeRateLimited", () => {
  beforeAll(cleanup);
  afterAll(cleanup);

  it("bloquea al llegar al tope por cuenta y no antes", async () => {
    for (let i = 0; i < 7; i += 1) {
      await logCredentialAudit({
        actorEmail: emails.rateLimit,
        action: "credential_password_change",
        entityId: id.userSolo,
      });
    }
    expect(await isCredentialChangeRateLimited(emails.rateLimit)).toBe(false);

    await logCredentialAudit({
      actorEmail: emails.rateLimit,
      action: "credential_phone_change",
      entityId: id.userSolo,
    });
    expect(await isCredentialChangeRateLimited(emails.rateLimit)).toBe(true);
  });
});
