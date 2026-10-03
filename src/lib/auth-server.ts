import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";

export const getServerSession = cache(async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
    // Las autorizaciones deben ver sesiones revocadas y datos actuales de BD.
    query: { disableCookieCache: true },
  });
});
