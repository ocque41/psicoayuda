import "server-only";
import { and, asc, eq, gt, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { helpRequests, practiceSettings, professionals } from "@/db/schema";
import { rankProfessionalsForRequest } from "@/lib/matching";
import { offerRequestToProfessionals } from "@/lib/offers";
import { insideWorkHours } from "@/lib/practice/domain";
import { purgeExpiredCallAssets } from "@/lib/practice/media";
export async function runPracticeJobs() {
  if (process.env.NIDO_PRACTICE_ENABLED !== "true")
    return { offered: 0, purged: 0, failed: 0 };
  const [requests, candidates, schedules] = await Promise.all([
    db
      .select()
      .from(helpRequests)
      .where(
        and(
          eq(helpRequests.status, "new"),
          ne(helpRequests.urgency, "alta"),
          gte(
            helpRequests.createdAt,
            new Date(Date.now() - 7 * 86400000).toISOString(),
          ),
        ),
      )
      .orderBy(asc(helpRequests.updatedAt), asc(helpRequests.id))
      .limit(20),
    db
      .select({
        id: professionals.id,
        languages: professionals.languages,
        supportAreas: professionals.supportAreas,
        crisisExperience: professionals.crisisExperience,
        currentActiveRequests: professionals.currentActiveRequests,
        maxActiveRequests: professionals.maxActiveRequests,
      })
      .from(professionals)
      .where(
        and(
          eq(professionals.status, "approved"),
          eq(professionals.acceptingRequests, true),
          eq(professionals.remoteAvailable, true),
          gt(
            professionals.maxActiveRequests,
            sql`${professionals.currentActiveRequests}`,
          ),
        ),
      ),
    db.select().from(practiceSettings),
  ]);
  const byProfessional = new Map(schedules.map((s) => [s.professionalId, s]));
  const now = Date.now();
  const available = candidates.filter((p) => {
    const schedule = byProfessional.get(p.id);
    return (
      !schedule ||
      insideWorkHours(
        now,
        schedule.timeZone,
        schedule.workStart,
        schedule.workEnd,
      )
    );
  });
  let offered = 0;
  for (const request of requests) {
    // Prioridad alta queda visible al equipo; el cron no decide atención clínica.
    if (request.urgency === "alta") continue;
    const ranked = rankProfessionalsForRequest(available, request);
    offered += await offerRequestToProfessionals(
      request.id,
      ranked.map((p) => p.professional.id),
    );
    // Avanza la cola aunque no haya coincidencia: una solicitud no bloquea a las siguientes.
    await db
      .update(helpRequests)
      .set({ updatedAt: new Date(now).toISOString() })
      .where(
        and(eq(helpRequests.id, request.id), eq(helpRequests.status, "new")),
      );
  }
  const { purged, failed } = await purgeExpiredCallAssets();
  return { offered, purged, failed };
}
