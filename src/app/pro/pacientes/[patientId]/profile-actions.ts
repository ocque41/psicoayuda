"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  auditLogs,
  practicePatientProfiles,
  practicePatients,
  professionals,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-server";
import { newId, nowIso } from "@/lib/ids";
import {
  type PatientProfileScope,
  type PatientProfileVersion,
  readPatientProfileVersion,
} from "@/lib/practice/patient-profile";
import {
  decryptPatientProfile,
  encryptPatientProfile,
} from "@/lib/practice/patient-profile-crypto";
import {
  hasPatientProfileContent,
  type PatientProfileContent,
  patientProfileSchema,
} from "@/lib/practice/patient-profile-domain";
import { currentPatientProfileActor } from "@/lib/practice/patient-profile-guard";

export type PatientProfileReadResult =
  | { ok: true; version: PatientProfileVersion }
  | {
      ok: false;
      message: string;
      accessDenied?: boolean;
      accountChanged?: boolean;
    };
export async function loadPatientProfileVersion(
  input: PatientProfileScope & { patientId: string },
): Promise<PatientProfileReadResult> {
  const id = z.string().min(1).max(100);
  const parsed = z
    .object({ accountId: id, professionalId: id, patientId: id })
    .safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      accessDenied: true,
      message: "No se pudo identificar la ficha. No se abrió ningún texto.",
    };
  try {
    const auth = await getServerSession();
    if (!auth?.session?.id || auth.user.id !== parsed.data.accountId)
      return {
        ok: false,
        accessDenied: true,
        accountChanged: true,
        message: "Tu cuenta cambió. Retiramos los datos de esta ventana.",
      };
    return await readPatientProfileVersion(
      parsed.data.patientId,
      {
        accountId: parsed.data.accountId,
        professionalId: parsed.data.professionalId,
      },
      auth.session.id,
    );
  } catch {
    return {
      ok: false,
      message:
        "No pudimos consultar la ficha guardada. El borrador sigue en esta ventana; comprueba la conexión y reintenta.",
    };
  }
}

export type PatientProfileState = {
  ok: boolean;
  message: string;
  revision?: number;
  conflict?: boolean;
  accessDenied?: boolean;
  accountChanged?: boolean;
};
export async function savePatientProfile(
  data: PatientProfileContent & {
    patientId: string;
    revision: number;
    consent: boolean;
    scope?: PatientProfileScope;
  },
): Promise<PatientProfileState> {
  const parsedScope = z
    .object({
      accountId: z.string().min(1).max(100),
      professionalId: z.string().min(1).max(100),
    })
    .optional()
    .safeParse(data?.scope);
  if (!parsedScope.success)
    return {
      ok: false,
      accessDenied: true,
      message:
        "No se pudo identificar el dueño de la ficha. No se guardaron los datos.",
    };
  const expectedScope = parsedScope.data;
  let auth: Awaited<ReturnType<typeof getServerSession>>;
  let pro: { id: string; userId: string; email: string } | undefined;
  try {
    auth = await getServerSession();
    if (auth?.user.id && auth.session?.id) {
      pro = await db.query.professionals.findFirst({
        columns: { id: true, userId: true, email: true },
        where: and(
          eq(professionals.userId, auth.user.id),
          eq(professionals.status, "approved"),
          sql`coalesce(${professionals.nonClinicalHelper},0) = 0`,
        ),
      });
    }
  } catch {
    return {
      ok: false,
      message:
        "No pudimos comprobar tu acceso. Conserva los datos y vuelve a intentar.",
    };
  }
  if (!auth?.session?.id || !pro || auth.user.id !== pro.userId)
    return {
      ok: false,
      accessDenied: true,
      accountChanged:
        !auth?.session?.id ||
        (!!expectedScope && expectedScope.accountId !== auth.user.id),
      message:
        "Tu sesión cambió. Conserva los datos y vuelve a entrar antes de guardarlos.",
    };
  if (
    expectedScope &&
    (expectedScope.accountId !== auth.user.id ||
      expectedScope.professionalId !== pro.id)
  )
    return {
      ok: false,
      accessDenied: true,
      accountChanged: true,
      message: "Tu cuenta cambió. No se guardaron los datos.",
    };
  const identification = z
    .object({
      patientId: z.string().min(1).max(100),
      revision: z
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER - 1),
      consent: z.literal(
        true,
        "Confirma la autorización para guardar estos datos en la ficha privada.",
      ),
    })
    .safeParse(data);
  if (!identification.success)
    return {
      ok: false,
      message:
        identification.error.issues[0]?.message ||
        "Revisa los datos de la ficha.",
    };
  const { patientId, revision } = identification.data;
  const guard = currentPatientProfileActor(
    pro.id,
    pro.userId,
    patientId,
    auth.session.id,
  );
  try {
    const [patient] = await db
      .select({ timeZone: practicePatients.timeZone })
      .from(practicePatients)
      .where(and(eq(practicePatients.id, patientId), guard))
      .limit(1);
    if (!patient)
      return {
        ok: false,
        accessDenied: true,
        message: "No tienes acceso a esta ficha. Conserva tus cambios.",
      };
    const parsed = patientProfileSchema(patient.timeZone).safeParse(data);
    if (!parsed.success)
      return {
        ok: false,
        message:
          parsed.error.issues[0]?.message || "Revisa los datos de la ficha.",
      };
    const existing = await db.query.practicePatientProfiles.findFirst({
      where: and(
        eq(practicePatientProfiles.patientId, patientId),
        eq(practicePatientProfiles.professionalId, pro.id),
        guard,
      ),
    });
    if ((existing?.revision ?? 0) !== revision)
      return {
        ok: false,
        conflict: true,
        message:
          "Esta ficha cambió en otra ventana. Tu borrador se conserva; consulta la ficha guardada antes de continuar.",
      };
    // No reemplazar un documento que no se puede descifrar, incluso con revisión válida.
    if (existing)
      await decryptPatientProfile(
        existing.contentCiphertext,
        pro.id,
        patientId,
      );
    if (!existing && !hasPatientProfileContent(parsed.data)) {
      const [stillAuthorized] = await db
        .select({ id: practicePatients.id })
        .from(practicePatients)
        .where(and(eq(practicePatients.id, patientId), guard))
        .limit(1);
      return stillAuthorized
        ? {
            ok: true,
            revision: 0,
            message: "No hay datos adicionales que guardar.",
          }
        : {
            ok: false,
            message: "Tu acceso cambió. Conserva tus datos y vuelve a entrar.",
          };
    }
    const ciphertext = await encryptPatientProfile(
      parsed.data,
      pro.id,
      patientId,
    );
    const timestamp = nowIso();
    const mutation = existing
      ? db
          .update(practicePatientProfiles)
          .set({
            contentCiphertext: ciphertext,
            revision: revision + 1,
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(practicePatientProfiles.patientId, patientId),
              eq(practicePatientProfiles.professionalId, pro.id),
              eq(practicePatientProfiles.revision, revision),
              guard,
              sql`EXISTS (SELECT 1 FROM practice_patients patient WHERE patient.id=${patientId} AND patient.professional_id=${pro.id} AND patient.time_zone=${patient.timeZone})`,
            ),
          )
          .returning({ revision: practicePatientProfiles.revision })
      : db
          .insert(practicePatientProfiles)
          .select(
            db
              .select({
                patientId: sql<string>`${patientId}`.as("patient_id"),
                professionalId: professionals.id,
                contentCiphertext: sql<string>`${ciphertext}`.as(
                  "content_ciphertext",
                ),
                revision: sql<number>`1`.as("revision"),
                updatedAt: sql<string>`${timestamp}`.as("updated_at"),
              })
              .from(professionals)
              .where(
                and(
                  eq(professionals.id, pro.id),
                  guard,
                  sql`EXISTS (SELECT 1 FROM practice_patients patient WHERE patient.id=${patientId} AND patient.professional_id=${pro.id} AND patient.time_zone=${patient.timeZone})`,
                ),
              ),
          )
          .onConflictDoNothing()
          .returning({ revision: practicePatientProfiles.revision });
    const [saved] = await db.batch([
      mutation,
      db.insert(auditLogs).select(
        db
          .select({
            id: sql<string>`${newId("log")}`.as("id"),
            actorEmail: sql<string>`${pro.email}`.as("actor_email"),
            action: sql<string>`'patient_profile_saved'`.as("action"),
            entityType: sql<string>`'practice'`.as("entity_type"),
            entityId: sql<string>`${patientId}`.as("entity_id"),
            metadata: sql<null>`NULL`.as("metadata"),
            createdAt: sql<string>`${timestamp}`.as("created_at"),
          })
          .from(professionals)
          .where(and(eq(professionals.id, pro.id), guard, sql`changes() > 0`)),
      ),
    ]);
    if (!saved.length)
      return {
        ok: false,
        conflict: true,
        message:
          "Esta ficha o tu acceso cambió. Tu borrador se conserva; consulta la ficha guardada antes de continuar.",
      };
    revalidatePath(`/pro/pacientes/${patientId}`);
    return {
      ok: true,
      revision: saved[0].revision,
      message:
        "Ficha privada guardada. Las notas de cada sesión se conservan por separado.",
    };
  } catch {
    return {
      ok: false,
      message:
        "No pudimos confirmar el guardado de esta ficha privada. Tus datos siguen en el formulario; comprueba la conexión o contacta a soporte.",
    };
  }
}
