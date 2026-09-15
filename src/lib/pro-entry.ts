/**
 * Destinos de entrada del voluntariado, en un solo lugar: el redirect de /pro
 * cuando ya hay sesión y los callbacks del formulario de acceso (AuthPanel).
 * Entrar con una cuenta existente va directo al panel; crear una cuenta nueva
 * va al perfil (paso 2 del registro). Nadie con sesión debe volver a ver el
 * formulario de acceso.
 */
export const PRO_SIGN_IN_PATH = "/pro/dashboard";
export const PRO_SIGN_UP_PATH = "/pro/onboarding";

/** A dónde mandar a alguien que ya tiene sesión y abre /pro. */
export function signedInEntryPath(input: {
  isAdmin: boolean;
  hasProfile: boolean;
}): string {
  if (input.isAdmin) return "/admin";
  return input.hasProfile ? PRO_SIGN_IN_PATH : PRO_SIGN_UP_PATH;
}
