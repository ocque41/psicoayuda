/** Tipos de la consulta FPV, sin código de servidor (los usa el cliente). */
export type FpvOfficial = {
  fpv: string | null;
  nombreCompleto: string;
  universidad: string | null;
  denominacionTitulo: string | null;
  colegios: { colegio: string; solvencia: boolean }[];
  solvenciaColegio: boolean | null;
  statusGeneral: boolean | null;
  deletedAt: string | null;
};

export type FpvAdmissionCheck = {
  status: "match" | "name_mismatch" | "not_found" | "unavailable";
  fpv: string;
  official: FpvOfficial | null;
  nameMatch: boolean;
  universityMatch: boolean | null;
  checkedAt: string;
};
