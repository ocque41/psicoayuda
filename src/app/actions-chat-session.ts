"use server";
import { cookies } from "next/headers";
import {
  PRO_COOKIE,
  PRO_INBOX_COOKIE,
  SEEKER_COOKIE,
} from "@/lib/seeker-token";
/** Revoca las capacidades de este navegador al salir; no borra claves ni datos. */
export async function clearChatSessionCookies() {
  const store = await cookies();
  for (const name of [PRO_COOKIE, PRO_INBOX_COOKIE, SEEKER_COOKIE])
    store.delete(name);
}
