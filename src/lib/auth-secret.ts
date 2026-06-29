import "server-only";

/**
 * Literal SOLO para desarrollo/test. Permite que los comandos locales y la CI
 * funcionen sin configurar un secreto. NUNCA debe firmar sesiones en producción
 * (por eso `getAuthSecret` falla en cerrado allí). Está en la allowlist de
 * scripts/secret-scan.mjs porque no es un secreto real.
 */
const DEV_ONLY_SECRET = "nido-local-development-secret-change-me";

/**
 * Resuelve el secreto de firma de sesiones/cookies (BETTER_AUTH_SECRET).
 *
 * Decisión de seguridad (auditoría): NO devolver nunca un fallback usable en
 * producción. Si el secreto no está configurado en runtime de producción,
 * lanzamos: es preferible un fallo visible (500) a firmar todas las sesiones,
 * tokens CSRF y estado OAuth con un literal público conocido del repo.
 *
 * - `next build` (NEXT_PHASE=phase-production-build) NO lanza: el build no
 *   firma sesiones reales y el secreto se inyecta en el runtime del Worker.
 * - Desarrollo/test: usa el literal de desarrollo.
 */
export function getAuthSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret) {
    return secret;
  }

  const isProduction = process.env.NODE_ENV === "production";
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  if (isProduction && !isBuildPhase) {
    throw new Error(
      "BETTER_AUTH_SECRET es obligatorio en producción. Configúralo con `wrangler secret put BETTER_AUTH_SECRET`.",
    );
  }

  return DEV_ONLY_SECRET;
}
