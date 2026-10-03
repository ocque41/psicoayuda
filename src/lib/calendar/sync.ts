import "server-only";
import { and, asc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  googleCalendarConnections as connections,
  googleCalendarEventLinks as links,
} from "@/db/calendar-schema";
import {
  type CalendarActor,
  calendarWindow,
  loadCalendarActor,
  ownedCalendarAppointments,
} from "./access";
import { googleCalendarConfig } from "./config";
import {
  calendarDigest,
  openCalendarSecret,
  sealCalendarSecret,
} from "./crypto";
import {
  type CalendarTokens,
  createNidoGoogleCalendar,
  deleteGoogleCalendarEvent,
  GoogleCalendarError,
  refreshCalendarTokens,
  upsertGoogleCalendarEvent,
} from "./google";

export const CALENDAR_SYNC_BATCH = 10;
type Cursor = { phase: "source" | "cleanup"; id: string };
export function calendarSyncCursor(value: string | null): Cursor {
  try {
    const p = JSON.parse(value || "null");
    if (
      p &&
      (p.phase === "source" || p.phase === "cleanup") &&
      typeof p.id === "string" &&
      p.id.length < 512
    )
      return p;
  } catch {}
  return { phase: "source", id: "" };
}
export async function parseConnectionTokens(
  connection: typeof connections.$inferSelect,
): Promise<CalendarTokens> {
  const value = JSON.parse(
    await openCalendarSecret(
      connection.tokenEnvelope,
      "token",
      connection.userId,
      connection.audience,
      connection.id,
    ),
  );
  if (
    !value ||
    typeof value.accessToken !== "string" ||
    !value.accessToken ||
    typeof value.refreshToken !== "string" ||
    !value.refreshToken ||
    typeof value.expiresAt !== "number" ||
    !Number.isFinite(value.expiresAt)
  )
    throw new GoogleCalendarError("reconnect");
  return value;
}
export async function opaqueCalendarEventId(
  connectionId: string,
  appointmentId: string,
  generation = 0,
) {
  return `n${await calendarDigest(JSON.stringify(["nido-google-event-v1", connectionId, appointmentId, generation]))}`;
}
export async function syncGoogleCalendar(
  actor: CalendarActor,
  options: { batchSize?: number; force?: boolean } = {},
) {
  if (!googleCalendarConfig()) throw new GoogleCalendarError("configuration");
  const now = new Date(),
    leaseId = crypto.randomUUID();
  const [connection] = await db
    .update(connections)
    .set({
      leaseId,
      leaseUntil: new Date(now.getTime() + 600000).toISOString(),
      updatedAt: now.toISOString(),
    })
    .where(
      and(
        eq(connections.userId, actor.userId),
        eq(connections.audience, actor.audience),
        eq(connections.status, "connected"),
        or(
          isNull(connections.leaseUntil),
          lt(connections.leaseUntil, now.toISOString()),
        ),
      ),
    )
    .returning();
  if (!connection) throw new Error("calendar_sync_busy_or_disconnected");
  const ownedLease = () =>
    and(
      eq(connections.id, connection.id),
      eq(connections.userId, actor.userId),
      eq(connections.audience, actor.audience),
      eq(connections.status, "connected"),
      eq(connections.leaseId, leaseId),
      gt(connections.leaseUntil, new Date().toISOString()),
    );
  const mappingLease = () =>
    sql`EXISTS (SELECT 1 FROM google_calendar_connections c WHERE c.id=${connection.id} AND c.user_id=${actor.userId} AND c.audience=${actor.audience} AND c.status='connected' AND c.lease_id=${leaseId} AND c.lease_until>${new Date().toISOString()})`;
  // Cada petición remota renueva solamente un lease todavía vigente. Un runner
  // desplazado no puede iniciar otro request ni confirmar escrituras locales.
  const renewLease = async () => {
    const renewed = await db
      .update(connections)
      .set({ leaseUntil: new Date(Date.now() + 600000).toISOString() })
      .where(ownedLease())
      .returning({ id: connections.id });
    if (!renewed.length) throw new Error("calendar_lease_lost");
  };
  const assertSaved = (rows: unknown[]) => {
    if (!rows.length) throw new Error("calendar_lease_lost");
  };
  let count = 0;
  const batchSize = Math.max(
    1,
    Math.min(CALENDAR_SYNC_BATCH, options.batchSize || CALENDAR_SYNC_BATCH),
  );
  try {
    await renewLease();
    let tokens = await parseConnectionTokens(connection);
    if (tokens.expiresAt < Date.now() + 60000) {
      await renewLease();
      tokens = await refreshCalendarTokens(tokens);
      assertSaved(
        await db
          .update(connections)
          .set({
            tokenEnvelope: await sealCalendarSecret(
              JSON.stringify(tokens),
              "token",
              actor.userId,
              actor.audience,
              connection.id,
            ),
          })
          .where(ownedLease())
          .returning({ id: connections.id }),
      );
    }
    let calendarId = connection.calendarId;
    if (!calendarId) {
      calendarId = await createNidoGoogleCalendar(
        tokens.accessToken,
        renewLease,
      );
      assertSaved(
        await db
          .update(connections)
          .set({ calendarId })
          .where(ownedLease())
          .returning({ id: connections.id }),
      );
    }
    let cursor = calendarSyncCursor(connection.syncCursor),
      complete = false;
    if (cursor.phase === "source") {
      const rows = await ownedCalendarAppointments(actor, {
        after: cursor.id,
        limit: batchSize + 1,
      });
      for (const item of rows.slice(0, batchSize)) {
        const freshActor = await loadCalendarActor(
          actor.userId,
          actor.audience,
        );
        if (!freshActor) throw new Error("calendar_permission_changed");
        const [current] = await ownedCalendarAppointments(freshActor, {
          ids: [item.id],
          limit: 1,
        });
        if (!current) continue;
        const id = crypto.randomUUID(),
          eventId = await opaqueCalendarEventId(connection.id, current.id);
        await renewLease();
        await db.all(sql`INSERT INTO google_calendar_event_links (id, connection_id, appointment_id, event_id, updated_at)
          SELECT ${id}, ${connection.id}, ${current.id}, ${eventId}, ${new Date().toISOString()}
          WHERE ${mappingLease()} ON CONFLICT DO NOTHING RETURNING id`);
        await renewLease();
        const mapping = await db.query.googleCalendarEventLinks.findFirst({
          where: and(
            eq(links.connectionId, connection.id),
            eq(links.appointmentId, current.id),
          ),
        });
        if (!mapping) throw new Error("calendar_mapping_unavailable");
        if (
          options.force === false &&
          mapping.status === "active" &&
          mapping.sourceUpdatedAt === current.updatedAt &&
          mapping.googleReminders === connection.googleReminders
        )
          continue;
        try {
          await upsertGoogleCalendarEvent(
            tokens.accessToken,
            calendarId,
            mapping.eventId,
            current,
            connection.googleReminders,
            false,
            renewLease,
          );
        } catch (error) {
          if (
            !(error instanceof GoogleCalendarError) ||
            error.code !== "event_gone"
          )
            throw error;
          const generation = mapping.generation + 1,
            replacement = await opaqueCalendarEventId(
              connection.id,
              current.id,
              generation,
            );
          assertSaved(
            await db
              .update(links)
              .set({ eventId: replacement, generation, status: "pending" })
              .where(
                and(
                  eq(links.id, mapping.id),
                  eq(links.connectionId, connection.id),
                  mappingLease(),
                ),
              )
              .returning({ id: links.id }),
          );
          await upsertGoogleCalendarEvent(
            tokens.accessToken,
            calendarId,
            replacement,
            current,
            connection.googleReminders,
            true,
            renewLease,
          );
        }
        assertSaved(
          await db
            .update(links)
            .set({
              status: "active",
              sourceUpdatedAt: current.updatedAt,
              googleReminders: connection.googleReminders,
              updatedAt: new Date().toISOString(),
            })
            .where(
              and(
                eq(links.id, mapping.id),
                eq(links.connectionId, connection.id),
                mappingLease(),
              ),
            )
            .returning({ id: links.id }),
        );
        count++;
      }
      cursor =
        rows.length > batchSize
          ? { phase: "source", id: rows[batchSize - 1].id }
          : { phase: "cleanup", id: "" };
    }
    if (cursor.phase === "cleanup") {
      if (!(await loadCalendarActor(actor.userId, actor.audience)))
        throw new Error("calendar_permission_changed");
      const rows = await db
        .select()
        .from(links)
        .where(
          and(
            eq(links.connectionId, connection.id),
            cursor.id ? gt(links.id, cursor.id) : undefined,
          ),
        )
        .orderBy(asc(links.id))
        .limit(batchSize + 1);
      const cleanupWindow = calendarWindow(),
        cleanupNow = new Date(cleanupWindow.from).getTime(),
        cleanupUntil = new Date(cleanupWindow.until).getTime();
      const owned = new Set(
        (
          await ownedCalendarAppointments(actor, {
            ids: rows
              .slice(0, batchSize)
              .flatMap((r) => (r.appointmentId ? [r.appointmentId] : [])),
            limit: batchSize,
            upcoming: false,
          })
        )
          .filter((r) => {
            const past = new Date(r.endsAt).getTime() <= cleanupNow;
            // Una cita futura que sale de la ventana debe retirar su copia
            // anterior. Conservamos eventos pasados ya mapeados del historial.
            return (
              r.status !== "cancelled" &&
              (past || new Date(r.startsAt).getTime() < cleanupUntil) &&
              (r.patientStatus !== "closed" || past)
            );
          })
          .map((r) => r.id),
      );
      for (const mapping of rows.slice(0, batchSize)) {
        if (
          mapping.status === "cancelled" ||
          (mapping.appointmentId && owned.has(mapping.appointmentId))
        )
          continue;
        await deleteGoogleCalendarEvent(
          tokens.accessToken,
          calendarId,
          mapping.eventId,
          renewLease,
        );
        assertSaved(
          await db
            .update(links)
            .set({ status: "cancelled", updatedAt: new Date().toISOString() })
            .where(
              and(
                eq(links.id, mapping.id),
                eq(links.connectionId, connection.id),
                mappingLease(),
              ),
            )
            .returning({ id: links.id }),
        );
        count++;
      }
      if (rows.length > batchSize)
        cursor = { phase: "cleanup", id: rows[batchSize - 1].id };
      else complete = true;
    }
    assertSaved(
      await db
        .update(connections)
        .set({
          syncCursor: complete ? null : JSON.stringify(cursor),
          lastSyncedAt: complete
            ? new Date().toISOString()
            : connection.lastSyncedAt,
          errorCode: null,
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date().toISOString(),
        })
        .where(ownedLease())
        .returning({ id: connections.id }),
    );
    return { complete, count };
  } catch (error) {
    const reconnect =
      error instanceof GoogleCalendarError &&
      ["reconnect", "calendar_missing", "scope", "offline_access"].includes(
        error.code,
      );
    await db
      .update(connections)
      .set({
        status: reconnect ? "needs_reconnect" : "connected",
        errorCode: reconnect ? "reconnect" : "retry",
        leaseId: null,
        leaseUntil: null,
        updatedAt: new Date().toISOString(),
      })
      .where(ownedLease());
    throw new Error(reconnect ? "calendar_reconnect" : "calendar_retry");
  }
}

/** Cada cron: una cuenta, hasta cinco fuentes y cinco mapeos de limpieza (diez elementos); resultado sin identidad ni token. */
export async function syncConnectedGoogleCalendars(limit = 1) {
  const result = { processed: 0, updated: 0, failed: 0, skipped: 0 };
  if (!googleCalendarConfig()) return result;
  const now = new Date().toISOString();
  const rows = await db
    .select({
      id: connections.id,
      userId: connections.userId,
      audience: connections.audience,
    })
    .from(connections)
    .where(
      and(
        eq(connections.status, "connected"),
        eq(connections.autoSync, true),
        or(isNull(connections.leaseUntil), lt(connections.leaseUntil, now)),
      ),
    )
    .orderBy(asc(connections.updatedAt), asc(connections.id))
    .limit(Math.max(1, Math.min(1, limit)));
  for (const row of rows) {
    const actor = await loadCalendarActor(
      row.userId,
      row.audience as "pro" | "patient",
    );
    if (!actor) {
      await db
        .update(connections)
        .set({
          autoSync: false,
          preferencesRevision: sql`${connections.preferencesRevision} + 1`,
          errorCode: "permission",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(eq(connections.id, row.id), eq(connections.userId, row.userId)),
        );
      result.skipped++;
      continue;
    }
    try {
      const completed = await syncGoogleCalendar(actor, {
        batchSize: 5,
        force: false,
      });
      result.processed++;
      result.updated += completed.count;
    } catch {
      result.failed++;
    }
  }
  return result;
}
