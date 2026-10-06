import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { waitlistEntries } from "@/db/schema";
import { newId } from "@/lib/ids";
import { nextPracticeTimestamp } from "@/lib/practice/mutation-guard";
import { currentWaitlistAdmin } from "./access";
import {
  generalWaitlistStatuses,
  type WaitlistAdmin,
  type WaitlistFormState,
} from "./types";

const mutationSchema = z.object({
  entryId: z.string().min(1).max(160),
  expectedStatus: z.string().min(1).max(80),
  expectedUpdatedAt: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => Number.isFinite(Date.parse(value))),
  status: z.enum(generalWaitlistStatuses),
});

export async function saveGeneralWaitlistStatus(
  actor: WaitlistAdmin,
  form: FormData,
): Promise<WaitlistFormState> {
  const parsed = mutationSchema.safeParse(
    Object.fromEntries(
      ["entryId", "expectedStatus", "expectedUpdatedAt", "status"].map(
        (key) => [key, form.get(key)],
      ),
    ),
  );
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      message: "Actualiza la ficha y elige un estado válido.",
    };
  const input = parsed.data;
  try {
    const scope = and(
      eq(waitlistEntries.id, input.entryId),
      eq(waitlistEntries.status, input.expectedStatus),
      eq(waitlistEntries.updatedAt, input.expectedUpdatedAt),
      isNull(waitlistEntries.anonymizedAt),
      currentWaitlistAdmin(actor),
    );
    if (input.status === input.expectedStatus) {
      const [live] = await db
        .select({ id: waitlistEntries.id })
        .from(waitlistEntries)
        .where(scope)
        .limit(1);
      return live
        ? {
            ok: true,
            message: "La solicitud ya tiene ese estado.",
            status: input.status,
            updatedAt: input.expectedUpdatedAt,
          }
        : conflict();
    }
    const timestamp = nextPracticeTimestamp(input.expectedUpdatedAt);
    const [written] = await db.batch([
      db
        .update(waitlistEntries)
        .set({ status: input.status, updatedAt: timestamp })
        .where(scope)
        .returning({ id: waitlistEntries.id }),
      // This proof must immediately follow the guarded UPDATE in the transaction.
      db.run(sql`INSERT INTO audit_logs (id, actor_email, action, entity_type, entity_id, metadata, created_at)
        SELECT ${newId("audit")}, ${actor.email}, 'waitlist_status_updated', 'waitlist_entry', ${input.entryId},
          ${JSON.stringify({ status: input.status })}, ${timestamp}
        WHERE changes()>0`),
    ]);
    return written.length
      ? {
          ok: true,
          message: "Estado guardado.",
          updatedAt: timestamp,
          status: input.status,
        }
      : conflict();
  } catch {
    return {
      ok: false,
      code: "unavailable",
      message:
        "No pudimos guardar el estado. Conserva la ficha abierta y vuelve a intentarlo.",
    };
  }
}

function conflict(): WaitlistFormState {
  return {
    ok: false,
    code: "conflict",
    message:
      "La ficha cambió o tu acceso dejó de estar disponible. Actualiza antes de volver a guardar.",
  };
}
