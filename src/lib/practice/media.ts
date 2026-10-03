import "server-only";
import { and, asc, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { practiceCallRooms } from "@/db/schema";
import { nowIso } from "@/lib/ids";
import { callsConfigured, dailyRequest } from "@/lib/practice/calls";
export type CallFile = {
  id: string;
  type: "recording" | "transcript";
  ready: boolean;
  room: string;
};
async function roomFiles(room: string): Promise<CallFile[]> {
  const [recordings, transcripts] = await Promise.all([
    dailyRequest<{
      data: { id: string; status: string }[];
      total_count: number;
    }>(`/recordings?room_name=${encodeURIComponent(room)}&limit=100`),
    dailyRequest<{
      data: { transcriptId: string; status: string }[];
      total_count: number;
    }>(`/transcript?room_name=${encodeURIComponent(room)}&limit=100`),
  ]);
  if (recordings.total_count > 100 || transcripts.total_count > 100)
    throw new Error(
      "Es necesario paginar los archivos de esta sesión antes de procesarlos.",
    );
  return [
    ...recordings.data.map((r) => ({
      id: r.id,
      type: "recording" as const,
      ready: r.status === "finished",
      room,
    })),
    ...transcripts.data
      .filter((t) => t.status !== "t_deleted")
      .map((t) => ({
        id: t.transcriptId,
        type: "transcript" as const,
        ready: t.status === "t_finished",
        room,
      })),
  ];
}
export async function filesForAppointment(appointmentId: string) {
  if (!callsConfigured()) return [];
  const rooms = await db
    .select()
    .from(practiceCallRooms)
    .where(
      and(
        eq(practiceCallRooms.appointmentId, appointmentId),
        gt(practiceCallRooms.expiresAt, new Date().toISOString()),
        isNull(practiceCallRooms.purgedAt),
      ),
    );
  const groups = await Promise.all(rooms.map((r) => roomFiles(r.name)));
  return groups.flat();
}
export async function purgeRoomAssets(name: string) {
  const files = await roomFiles(name);
  for (const file of files)
    await dailyRequest(
      `/${file.type === "recording" ? "recordings" : "transcript"}/${encodeURIComponent(file.id)}`,
      undefined,
      "DELETE",
    );
  await dailyRequest(`/rooms/${encodeURIComponent(name)}`, undefined, "DELETE");
  await db
    .update(practiceCallRooms)
    .set({ purgedAt: nowIso() })
    .where(eq(practiceCallRooms.name, name));
}
export async function purgeExpiredCallAssets(now = Date.now()) {
  if (!callsConfigured()) return { purged: 0, failed: 0 };
  const rooms = await db
    .select()
    .from(practiceCallRooms)
    .where(
      and(
        isNull(practiceCallRooms.purgedAt),
        lt(practiceCallRooms.expiresAt, new Date(now).toISOString()),
      ),
    )
    .orderBy(asc(practiceCallRooms.expiresAt), asc(practiceCallRooms.name))
    .limit(25);
  let purged = 0;
  let failed = 0;
  for (const room of rooms) {
    try {
      await purgeRoomAssets(room.name);
      purged++;
    } catch {
      // Conserva el puntero para reintentar. No registra identificadores,
      // archivos ni respuestas del proveedor, que podrían contener datos.
      failed++;
    }
  }
  if (failed > 0)
    console.error(
      JSON.stringify({
        event: "call_asset_purge_failed",
        failed,
        purged,
        attempted: rooms.length,
      }),
    );
  return { purged, failed };
}
