import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { practicePatientProfiles, practicePatients } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { decryptPatientProfile } from "./patient-profile-crypto";
import {
  emptyPatientProfile,
  type PatientProfileContent,
} from "./patient-profile-domain";
import { currentPatientProfileActor } from "./patient-profile-guard";

export type PatientProfileView = {
  status: "ready" | "unavailable";
  content: PatientProfileContent;
  revision: number;
};
export async function readPatientProfile(
  patientId: string,
  professionalId: string,
): Promise<PatientProfileView> {
  const unavailable: PatientProfileView = {
    status: "unavailable",
    content: { ...emptyPatientProfile },
    revision: 0,
  };
  try {
    const auth = await getServerSession();
    if (!auth?.user.id || !auth.session?.id) return unavailable;
    const [row] = await db
      .select({
        ciphertext: practicePatientProfiles.contentCiphertext,
        revision: practicePatientProfiles.revision,
      })
      .from(practicePatients)
      .leftJoin(
        practicePatientProfiles,
        and(
          eq(practicePatientProfiles.patientId, practicePatients.id),
          eq(practicePatientProfiles.professionalId, professionalId),
        ),
      )
      .where(
        and(
          eq(practicePatients.id, patientId),
          eq(practicePatients.professionalId, professionalId),
          currentPatientProfileActor(
            professionalId,
            auth.user.id,
            patientId,
            auth.session.id,
          ),
        ),
      )
      .limit(1);
    if (!row) return unavailable;
    if (!row.ciphertext)
      return {
        status: "ready",
        content: { ...emptyPatientProfile },
        revision: 0,
      };
    const content = await decryptPatientProfile(
      row.ciphertext,
      professionalId,
      patientId,
    );
    // El descifrado es asíncrono: una revocación mientras termina no revela texto.
    const [authorized] = await db
      .select({ id: practicePatients.id })
      .from(practicePatients)
      .where(
        and(
          eq(practicePatients.id, patientId),
          currentPatientProfileActor(
            professionalId,
            auth.user.id,
            patientId,
            auth.session.id,
          ),
        ),
      )
      .limit(1);
    return authorized
      ? { status: "ready", content, revision: row.revision ?? 0 }
      : unavailable;
  } catch {
    return unavailable;
  }
}
