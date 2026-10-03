export const patientStates = [
  "new",
  "contacted",
  "active",
  "waiting",
  "closed",
] as const;

export const patientStateLabels: Record<string, string> = {
  new: "Por contactar",
  contacted: "Contactado",
  active: "En acompañamiento",
  waiting: "En pausa",
  closed: "Cerrado",
};
