export const SESSION_NOTE_ENTRY_ID = "nota-nueva";

/** Destino del editor nuevo de una cita; sólo identificadores, nunca texto. */
export function sessionNoteEntryHref(patientId: string, appointmentId: string) {
  return `/pro/pacientes/${encodeURIComponent(patientId)}?notaSesion=${encodeURIComponent(appointmentId)}#${SESSION_NOTE_ENTRY_ID}`;
}
