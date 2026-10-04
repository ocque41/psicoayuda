const CALLBACK = "/auth/session-ready";

/** El destino siempre es una ruta propia; nunca una URL de un proveedor. */
export function accountSessionDestination(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    [...value].some((character) => character.charCodeAt(0) <= 32)
  )
    return "/empezar";
  const url = new URL(value, "https://nido.local");
  if (url.origin !== "https://nido.local" || url.pathname === CALLBACK)
    return "/empezar";
  return `${url.pathname}${url.search}${url.hash}`;
}

export function accountSessionCallbackUrl(destination: string): string {
  const params = new URLSearchParams({
    destino: accountSessionDestination(destination),
  });
  return `${CALLBACK}?${params}`;
}
