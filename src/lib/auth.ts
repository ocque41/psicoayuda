import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { sendEmail } from "@/lib/email";
import { buildPasswordResetEmail } from "@/lib/email-templates";
import { hashPassword, verifyPassword } from "@/lib/password-hash";
import { SITE_URL } from "@/lib/site";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// Solo se aceptan callbacks/peticiones desde nuestros propios orígenes. En
// desarrollo aceptamos cualquier puerto de localhost, porque `next dev` puede
// arrancar en 3000, 3100, etc.; si el puerto no coincide con el baseURL,
// better-auth rechaza el login con INVALID_ORIGIN. En producción solo se
// confía en la URL configurada y el dominio público.
const devOrigins =
  process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:*", "http://127.0.0.1:*"];

// El dominio público puede servirse con y sin `www.`, y better-auth compara
// el Origin literal: si solo confiamos en el apex, todo login iniciado desde
// www.saludmental-venezuela.com muere con INVALID_ORIGIN ("no me deja
// entrar"). Confiamos en ambas variantes.
function conVariantesWww(url: string): string[] {
  try {
    const u = new URL(url);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return [url];
    const alterna = u.hostname.startsWith("www.")
      ? url.replace("://www.", "://")
      : `${u.protocol}//www.${u.host}`;
    return [url, alterna];
  } catch {
    return [url];
  }
}

const trustedOrigins = Array.from(
  new Set(
    [baseURL, ...conVariantesWww(SITE_URL), ...devOrigins].filter(
      (value): value is string => Boolean(value),
    ),
  ),
);

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const socialProviders =
  googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : {};

export const auth = betterAuth({
  baseURL,
  secret: getAuthSecret(),
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  // Login dinámico: Google O correo+contraseña (como Fiverr y similares).
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
    // PBKDF2 nativo (WebCrypto) en lugar del scrypt JS por defecto: el límite
    // de CPU de Workers mataba el hash del registro y dejaba cuentas a medias
    // (fila user sin credencial). verify acepta también los hashes scrypt de
    // las cuentas creadas antes de este cambio.
    password: { hash: hashPassword, verify: verifyPassword },
    // "¿Olvidaste tu contraseña?": Better Auth genera un token de un solo uso
    // (caduca en 1 h), manda el enlace por correo y, tras validarlo en
    // /reset-password/<token>, redirige a /pro/restablecer. Sin esta vía,
    // quien olvidaba su clave quedaba fuera para siempre (casos reales).
    sendResetPassword: async ({ user, url }) => {
      const correo = buildPasswordResetEmail({
        resetUrl: url,
        name: user.name,
      });
      await sendEmail({
        to: user.email,
        subject: correo.subject,
        html: correo.html,
        text: correo.text,
      });
    },
  },
  socialProviders,
  advanced: {
    ipAddress: {
      // Cloudflare entrega la IP real del cliente en cf-connecting-ip. Sin
      // esto Better Auth no resolvía ninguna IP y el rate limit degradaba a
      // UN cupo global compartido: una ráfaga de intentos de cualquiera
      // bloqueaba el login de todos los demás.
      ipAddressHeaders: ["cf-connecting-ip"],
    },
  },
  // Limita intentos de login/callback (defensa básica contra fuerza bruta y
  // enumeración). En Workers es por isolate; reforzar con KV/WAF en producción.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
    // El default de Better Auth para /sign-in* es 3 intentos/10s: demasiado
    // agresivo para un humano que teclea mal la clave (caps lock, autofill con
    // espacio, teclado móvil) — al 4º intento recibe 429 y lo vive como "no me
    // deja entrar". Damos margen humano (10/min) sin abrir la puerta a fuerza
    // bruta real; el hash PBKDF2 y el kill-switch en D1 siguen protegiendo.
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  plugins: [nextCookies()],
  appName: "Nido",
  telemetry: {
    enabled: false,
  },
});
