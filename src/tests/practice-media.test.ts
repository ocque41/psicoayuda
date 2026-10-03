import { eq, like } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { practiceCallRooms } from "@/db/schema";

const { dailyRequest, callsConfigured } = vi.hoisted(() => ({
  dailyRequest: vi.fn(),
  callsConfigured: vi.fn(() => true),
}));
vi.mock("@/lib/practice/calls", () => ({ dailyRequest, callsConfigured }));

import { purgeExpiredCallAssets } from "@/lib/practice/media";

const P = "test-media-purge";
const NOW = Date.parse("2026-10-02T12:00:00.000Z");
type FixtureRoom = { recordings: Set<string>; transcripts: Set<string> };
let rooms: Map<string, FixtureRoom>;
let failTranscriptOnce: boolean;
let operatorLog: ReturnType<typeof vi.spyOn>;

async function cleanup() {
  await db
    .delete(practiceCallRooms)
    .where(like(practiceCallRooms.name, `${P}-%`));
}
function installProviderFixture() {
  dailyRequest
    .mockReset()
    .mockImplementation(
      async (path: string, _body: unknown, method?: string) => {
        const url = new URL(`https://fixture.test${path}`);
        if (method !== "DELETE") {
          const room = rooms.get(url.searchParams.get("room_name") || "");
          if (!room) throw new Error("fixture_missing_room");
          if (url.pathname === "/recordings")
            return {
              data: [...room.recordings].map((id) => ({
                id,
                status: "finished",
              })),
              total_count: room.recordings.size,
            };
          if (url.pathname === "/transcript")
            return {
              data: [...room.transcripts].map((transcriptId) => ({
                transcriptId,
                status: "t_finished",
              })),
              total_count: room.transcripts.size,
            };
          throw new Error("fixture_unknown_request");
        }
        const [kind, id] = url.pathname.slice(1).split("/");
        if (
          kind === "transcript" &&
          id === `${P}-first-transcript` &&
          failTranscriptOnce
        ) {
          failTranscriptOnce = false;
          throw new Error("fixture_private_provider_payload");
        }
        if (kind === "rooms") rooms.delete(id);
        else
          for (const room of rooms.values()) {
            if (kind === "recordings") room.recordings.delete(id);
            else if (kind === "transcript") room.transcripts.delete(id);
            else throw new Error("fixture_unknown_delete");
          }
        return undefined;
      },
    );
}
describe("retención de grabaciones y transcripciones", () => {
  beforeEach(async () => {
    await cleanup();
    callsConfigured.mockReturnValue(true);
    failTranscriptOnce = true;
    rooms = new Map(
      ["first", "second", "future"].map((suffix) => [
        `${P}-${suffix}`,
        {
          recordings: new Set([`${P}-${suffix}-recording`]),
          transcripts: new Set([`${P}-${suffix}-transcript`]),
        },
      ]),
    );
    installProviderFixture();
    operatorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    await db.insert(practiceCallRooms).values([
      { name: `${P}-first`, expiresAt: new Date(NOW - 2000).toISOString() },
      { name: `${P}-second`, expiresAt: new Date(NOW - 1000).toISOString() },
      { name: `${P}-future`, expiresAt: new Date(NOW + 1000).toISOString() },
    ]);
  });
  afterEach(async () => {
    operatorLog.mockRestore();
    await cleanup();
  });
  it("un fallo parcial conserva la sala y no bloquea la segunda; el siguiente intento completa la purga", async () => {
    expect(await purgeExpiredCallAssets(NOW)).toEqual({ purged: 1, failed: 1 });
    const first = await db.query.practiceCallRooms.findFirst({
      where: eq(practiceCallRooms.name, `${P}-first`),
    });
    const second = await db.query.practiceCallRooms.findFirst({
      where: eq(practiceCallRooms.name, `${P}-second`),
    });
    expect(first?.purgedAt).toBeNull();
    expect(second?.purgedAt).toBeTruthy();
    expect(rooms.get(`${P}-first`)?.recordings.size).toBe(0);
    expect(rooms.get(`${P}-first`)?.transcripts.size).toBe(1);
    expect(rooms.has(`${P}-second`)).toBe(false);
    expect(rooms.has(`${P}-future`)).toBe(true);
    expect(operatorLog).toHaveBeenCalledExactlyOnceWith(
      JSON.stringify({
        event: "call_asset_purge_failed",
        failed: 1,
        purged: 1,
        attempted: 2,
      }),
    );
    expect(JSON.stringify(operatorLog.mock.calls)).not.toContain(
      "fixture_private_provider_payload",
    );
    expect(JSON.stringify(operatorLog.mock.calls)).not.toContain(P);

    operatorLog.mockClear();
    expect(await purgeExpiredCallAssets(NOW)).toEqual({ purged: 1, failed: 0 });
    expect(
      (
        await db.query.practiceCallRooms.findFirst({
          where: eq(practiceCallRooms.name, `${P}-first`),
        })
      )?.purgedAt,
    ).toBeTruthy();
    expect(rooms.has(`${P}-first`)).toBe(false);
    expect(operatorLog).not.toHaveBeenCalled();
    const callsAfterRetry = dailyRequest.mock.calls.length;
    expect(await purgeExpiredCallAssets(NOW)).toEqual({ purged: 0, failed: 0 });
    expect(dailyRequest.mock.calls).toHaveLength(callsAfterRetry);
  });
  it("un fallo al listar archivos no marca la sala como purgada y permite procesar el resto", async () => {
    const fixture = dailyRequest.getMockImplementation();
    dailyRequest.mockImplementation(async (...args) => {
      if (args[0] === `/recordings?room_name=${P}-first&limit=100`)
        throw new Error("fixture_provider_unavailable");
      return fixture?.(...args);
    });
    expect(await purgeExpiredCallAssets(NOW)).toEqual({ purged: 1, failed: 1 });
    expect(
      (
        await db.query.practiceCallRooms.findFirst({
          where: eq(practiceCallRooms.name, `${P}-first`),
        })
      )?.purgedAt,
    ).toBeNull();
    expect(rooms.get(`${P}-first`)?.recordings.size).toBe(1);
    expect(rooms.get(`${P}-first`)?.transcripts.size).toBe(1);
    expect(rooms.has(`${P}-second`)).toBe(false);
    expect(
      dailyRequest.mock.calls.some((call) => call[0] === `/rooms/${P}-first`),
    ).toBe(false);
  });
});
