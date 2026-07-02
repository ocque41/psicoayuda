import "server-only";

import { verifyPassword as verifyScryptLegado } from "better-auth/crypto";

/**
 * Hash de contraseñas con PBKDF2-SHA256 vía WebCrypto. `crypto.subtle` corre
 * en código nativo del runtime (Workers y Node), así que apenas consume el
 * presupuesto de CPU del Worker. El scrypt por defecto de Better Auth es JS
 * puro: con el límite de CPU por request de Workers podía matar el registro a
 * mitad — quedaba la fila `user` creada y la credencial sin guardar, y la
 * persona bloqueada ("ya existe una cuenta" / "contraseña incorrecta").
 *
 * Formato: `pbkdf2:<iteraciones>:<salt b64>:<hash b64>`. `verifyPassword`
 * mantiene compatibilidad con los hashes scrypt de las cuentas anteriores.
 */
const ITERACIONES = 100_000;
const PREFIJO = "pbkdf2";

function aBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function desdeBase64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));
}

async function derivar(
  password: string,
  salt: Uint8Array,
  iteraciones: number,
): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: iteraciones,
    },
    clave,
    256,
  );
  return new Uint8Array(bits);
}

// Comparación en tiempo constante: no cortocircuita en el primer byte
// distinto, para no filtrar información por tiempos.
function igualdadConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a[i] ^ b[i];
  }
  return diferencia === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(password, salt, ITERACIONES);
  return `${PREFIJO}:${ITERACIONES}:${aBase64(salt)}:${aBase64(hash)}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (!hash.startsWith(`${PREFIJO}:`)) {
    // Hash legado (scrypt de Better Auth): solo lo pagan los logins de
    // cuentas creadas antes de este cambio.
    return verifyScryptLegado({ hash, password });
  }
  try {
    const [, iterTexto, saltB64, hashB64] = hash.split(":");
    const iteraciones = Number(iterTexto);
    if (!Number.isInteger(iteraciones) || iteraciones < 1) return false;
    const esperado = desdeBase64(hashB64);
    const calculado = await derivar(
      password,
      desdeBase64(saltB64),
      iteraciones,
    );
    return igualdadConstante(calculado, esperado);
  } catch {
    // Hash corrupto o base64 inválido: credencial no verificable.
    return false;
  }
}
