import { hashPassword as hashScryptLegado } from "better-auth/crypto";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password-hash";

describe("password-hash (PBKDF2 + compatibilidad scrypt)", () => {
  it("hash y verificación PBKDF2: ida y vuelta", async () => {
    const hash = await hashPassword("contraseña-segura-123");
    expect(hash.startsWith("pbkdf2:100000:")).toBe(true);
    await expect(
      verifyPassword({ hash, password: "contraseña-segura-123" }),
    ).resolves.toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await hashPassword("contraseña-segura-123");
    await expect(
      verifyPassword({ hash, password: "otra-cosa-distinta" }),
    ).resolves.toBe(false);
  });

  it("dos hashes de la misma contraseña difieren (salt aleatoria)", async () => {
    const a = await hashPassword("misma-clave-8+");
    const b = await hashPassword("misma-clave-8+");
    expect(a).not.toBe(b);
  });

  it("verifica hashes scrypt legados de better-auth", async () => {
    const legado = await hashScryptLegado("clave-antigua-8");
    expect(legado.startsWith("pbkdf2:")).toBe(false);
    await expect(
      verifyPassword({ hash: legado, password: "clave-antigua-8" }),
    ).resolves.toBe(true);
    await expect(
      verifyPassword({ hash: legado, password: "clave-equivocada" }),
    ).resolves.toBe(false);
  });

  it("un hash pbkdf2 corrupto no revienta: devuelve false", async () => {
    await expect(
      verifyPassword({ hash: "pbkdf2:abc:###:$$$", password: "lo-que-sea" }),
    ).resolves.toBe(false);
    await expect(
      verifyPassword({ hash: "pbkdf2:0::", password: "lo-que-sea" }),
    ).resolves.toBe(false);
  });
});
