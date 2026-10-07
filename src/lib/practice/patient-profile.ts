import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { practicePatientProfiles, practicePatients } from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { decryptPatientProfile } from "./patient-profile-crypto";
import {
  emptyPatientProfile,
  type PatientProfileContent,
} from "./patient-profile-domain";
import { currentPatientProfileActor } from "./patient-profile-guard";

export type PatientProfileScope = { accountId: string; professionalId: string };
export type PatientProfileView = {
  status: "ready" | "unavailable";
  content: PatientProfileContent;
  revision: number;
  /** Metadatos del dueño que autorizó el RSC, nunca una concesión de permiso. */
  scope?: PatientProfileScope;
};
export type PatientProfileVersion = {
  content: PatientProfileContent;
  revision: number;
  updatedAt: string | null;
  timeZone: string;
  scope: PatientProfileScope;
};
export type PatientProfileVersionResult =
  | { ok: true; version: PatientProfileVersion }
  | { ok: false; accessDenied?: boolean; message: string };

/** Snapshot propio; decide permisos y versión de nuevo tras descifrar. Sin writes. */
export async function readPatientProfileVersion(
  patientId: string,
  scope: PatientProfileScope,
  sessionId: string,
): Promise<PatientProfileVersionResult> {
  const guard = currentPatientProfileActor(
    scope.professionalId,
    scope.accountId,
    patientId,
    sessionId,
  );
  const own = and(
    eq(practicePatients.id, patientId),
    eq(practicePatients.professionalId, scope.professionalId),
    guard,
  );
  const query = () =>
    db
      .select({
        ciphertext: practicePatientProfiles.contentCiphertext,
        revision: practicePatientProfiles.revision,
        updatedAt: practicePatientProfiles.updatedAt,
        timeZone: practicePatients.timeZone,
      })
      .from(practicePatients)
      .leftJoin(
        practicePatientProfiles,
        and(
          eq(practicePatientProfiles.patientId, practicePatients.id),
          eq(practicePatientProfiles.professionalId, scope.professionalId),
        ),
      );
  const [row] = await query().where(own).limit(1);
  const denied: PatientProfileVersionResult = {
    ok: false,
    accessDenied: true,
    message:
      "Esta ficha ya no está disponible para tu cuenta. No se abrió la versión guardada.",
  };
  if (!row) return denied;
  const content = row.ciphertext
    ? await decryptPatientProfile(
        row.ciphertext,
        scope.professionalId,
        patientId,
      )
    : { ...emptyPatientProfile };
  const [stable] = await query()
    .where(
      and(
        own,
        eq(practicePatients.timeZone, row.timeZone),
        row.ciphertext
          ? and(
              eq(practicePatientProfiles.contentCiphertext, row.ciphertext),
              eq(practicePatientProfiles.revision, row.revision ?? 0),
              eq(practicePatientProfiles.updatedAt, row.updatedAt ?? ""),
            )
          : isNull(practicePatientProfiles.patientId),
      ),
    )
    .limit(1);
  if (!stable) {
    const [accessible] = await db
      .select({ id: practicePatients.id })
      .from(practicePatients)
      .where(own)
      .limit(1);
    return accessible
      ? {
          ok: false,
          message:
            "La ficha volvió a cambiar mientras la consultábamos. Tu borrador se conserva; vuelve a consultar.",
        }
      : denied;
  }
  return {
    ok: true,
    version: {
      content,
      revision: row.revision ?? 0,
      updatedAt: row.updatedAt,
      timeZone: row.timeZone,
      scope,
    },
  };
}

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
    const result = await readPatientProfileVersion(
      patientId,
      { accountId: auth.user.id, professionalId },
      auth.session.id,
    );
    return result.ok
      ? {
          status: "ready",
          content: result.version.content,
          revision: result.version.revision,
          scope: result.version.scope,
        }
      : unavailable;
  } catch {
    return unavailable;
  }
}
