/** Modelo de presentación sin validadores ni código del servidor. */
export const patientSexValues = [
  "",
  "female",
  "male",
  "intersex",
  "other",
  "not_specified",
] as const;
export const patientSexLabels: Record<
  (typeof patientSexValues)[number],
  string
> = {
  "": "Sin registrar",
  female: "Femenino",
  male: "Masculino",
  intersex: "Intersexual",
  other: "Otro",
  not_specified: "Prefiere no indicarlo",
};
export type PatientProfileContent = {
  sex: (typeof patientSexValues)[number];
  birthDate: string;
  consultationReason: string;
  generalNote: string;
};
export const emptyPatientProfile: PatientProfileContent = {
  sex: "",
  birthDate: "",
  consultationReason: "",
  generalNote: "",
};
