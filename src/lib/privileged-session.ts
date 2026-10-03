import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";

/** Los permisos internos usan identidad y verificación actuales, nunca el correo declarado al registrarse. */
export const getVerifiedServerSession = cache(async () => {
  const session = await getServerSession();
  if (!session?.user.id) return null;
  const current = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { id: true, email: true, emailVerified: true },
  });
  if (!current?.emailVerified) return null;
  return { ...session, user: { ...session.user, ...current } };
});
