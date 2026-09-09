import { and, eq, isNull, lt, ne } from "drizzle-orm";
import { auditLogs, helpRequests } from "@/db/schema";
import { newId } from "@/lib/ids";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inactive help requests are closed after this many days (privacy policy default). */
export const CLOSE_AFTER_DAYS = 30;
/** Help requests are anonymized/deleted after this many days (privacy policy default). */
export const ANONYMIZE_AFTER_DAYS = 90;

export interface RetentionThresholds {
  /** ISO timestamp; requests created before this should be closed. */
  closeBefore: string;
  /** ISO timestamp; requests created before this should be anonymized. */
  anonymizeBefore: string;
}

/**
 * Pure date math for the retention windows promised in src/app/privacidad.
 *
 * Deliberately free of any `server-only`/DB imports so the thresholds can be
 * unit-tested directly (see src/tests/retention.test.ts).
 */
export function retentionThresholds(now: Date): RetentionThresholds {
  const ms = now.getTime();
  return {
    closeBefore: new Date(ms - CLOSE_AFTER_DAYS * DAY_MS).toISOString(),
    anonymizeBefore: new Date(ms - ANONYMIZE_AFTER_DAYS * DAY_MS).toISOString(),
  };
}

export interface RetentionResult {
  closed: number;
  anonymized: number;
  closeBefore: string;
  anonymizeBefore: string;
}

/**
 * Enforce the retention windows promised in the privacy policy
 * (src/app/privacidad/page.tsx, "Retención y eliminación"):
 *
 *  1. close help requests inactive for more than CLOSE_AFTER_DAYS days, and
 *  2. anonymize (PII-null) help requests older than ANONYMIZE_AFTER_DAYS days,
 *     freeing any professional capacity still tied to them.
 *
 * `@/db` and `@/lib/assignment` are imported lazily so the pure helpers above
 * stay importable from unit tests without tripping their `server-only` guard.
 */
export async function closeAndAnonymizeStaleRequests(
  now: Date = new Date(),
): Promise<RetentionResult> {
  const { closeBefore, anonymizeBefore } = retentionThresholds(now);
  const timestamp = now.toISOString();

  const { db } = await import("@/db");
  const { releaseAssignmentsForRequest } = await import("@/lib/assignment");

  // 1) Close inactive requests older than 30 days that are not already closed.
  const closedRows = await db
    .update(helpRequests)
    .set({ status: "closed", updatedAt: timestamp })
    .where(
      and(
        ne(helpRequests.status, "closed"),
        lt(helpRequests.createdAt, closeBefore),
      ),
    )
    .returning({ id: helpRequests.id });

  // 2) Anonymize requests older than 90 days that still hold PII.
  const staleRows = await db
    .select({ id: helpRequests.id })
    .from(helpRequests)
    .where(
      and(
        isNull(helpRequests.anonymizedAt),
        lt(helpRequests.createdAt, anonymizeBefore),
      ),
    );

  for (const { id } of staleRows) {
    // Return any active assignment capacity to the professional first.
    await releaseAssignmentsForRequest(id);

    // Same PII-nulling field-set as adminAnonymizeHelpRequest (src/app/actions.ts).
    await db
      .update(helpRequests)
      .set({
        email: `anon-${id}@nido.local`,
        country: null,
        state: null,
        city: null,
        lat: null,
        lng: null,
        locationConsent: false,
        consentContact: false,
        requesterHash: null,
        status: "closed",
        anonymizedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(helpRequests.id, id));

    // Audit each anonymization performed by the retention batch.
    await db.insert(auditLogs).values({
      id: newId("log"),
      actorEmail: null,
      action: "data_retention",
      entityType: "help_request",
      entityId: id,
      metadata: JSON.stringify({ reason: "retention_90d", anonymizeBefore }),
      createdAt: timestamp,
    });
  }

  return {
    closed: closedRows.length,
    anonymized: staleRows.length,
    closeBefore,
    anonymizeBefore,
  };
}
