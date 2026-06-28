import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { helpRequests, professionals } from "@/db/schema";

type ProfessionalRow = typeof professionals.$inferSelect;
type HelpRequestRow = typeof helpRequests.$inferSelect;

function parseList(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function scoreProfessional(
  professional: Pick<
    ProfessionalRow,
    | "languages"
    | "supportAreas"
    | "crisisExperience"
    | "currentActiveRequests"
    | "maxActiveRequests"
  >,
  request: Pick<HelpRequestRow, "language" | "needCategory" | "urgency">,
) {
  const proLanguages = parseList(professional.languages);
  const supportAreas = parseList(professional.supportAreas);
  let score = 0;

  if (proLanguages.includes(request.language)) score += 30;
  if (supportAreas.includes(request.needCategory)) score += 20;
  if (request.urgency === "alta" && professional.crisisExperience) score += 10;

  score += Math.max(
    0,
    professional.maxActiveRequests - professional.currentActiveRequests,
  );

  return score;
}

export async function suggestProfessionalsForRequest(helpRequestId: string) {
  const request = await db.query.helpRequests.findFirst({
    where: eq(helpRequests.id, helpRequestId),
  });

  if (!request) return [];

  const candidates = await db
    .select()
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
    );

  return candidates
    .map((professional) => ({
      professional,
      score: scoreProfessional(professional, request),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        a.professional.currentActiveRequests -
        b.professional.currentActiveRequests
      );
    })
    .slice(0, 3);
}
