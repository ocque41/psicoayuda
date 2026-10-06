import "server-only";
import { decryptNote, encryptNote } from "./note-crypto";
import {
  type PatientProfileContent,
  patientProfileContentSchema,
} from "./patient-profile-domain";

const PROFILE_BINDING = "patient-profile-v1";
const PROFILE_NAMESPACE = "nido-patient-profile-v1";
export function encryptPatientProfile(
  content: PatientProfileContent,
  professionalId: string,
  patientId: string,
) {
  return encryptNote(
    JSON.stringify(content),
    professionalId,
    patientId,
    PROFILE_BINDING,
    PROFILE_NAMESPACE,
  );
}
export async function decryptPatientProfile(
  ciphertext: string,
  professionalId: string,
  patientId: string,
) {
  const json = await decryptNote(
    ciphertext,
    professionalId,
    patientId,
    PROFILE_BINDING,
    PROFILE_NAMESPACE,
  );
  return patientProfileContentSchema.parse(JSON.parse(json));
}
