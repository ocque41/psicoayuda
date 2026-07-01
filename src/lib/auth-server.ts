import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

/**
 * Comprueba la sesión directamente en D1. Se usa antes de modificar datos,
 * administrar cuentas o emitir credenciales de chat para que una sesión
 * revocada nunca pueda autorizar una operación durante los 60 s de caché.
 */
export async function getFreshServerSession() {
  return auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
}
