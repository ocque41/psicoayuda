import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getAuthSecret } from "@/lib/auth-secret";
import { SITE_URL } from "@/lib/site";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

// Solo se aceptan callbacks/peticiones desde nuestros propios orígenes.
const trustedOrigins = Array.from(
  new Set(
    [baseURL, SITE_URL].filter((value): value is string => Boolean(value)),
  ),
);

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
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
  },
  // Limita intentos de login/callback (defensa básica contra fuerza bruta y
  // enumeración). En Workers es por isolate; reforzar con KV/WAF en producción.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  plugins: [nextCookies()],
  appName: "Nido",
  telemetry: {
    enabled: false,
  },
});
