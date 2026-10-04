export const admissionGateKeys = [
  "identity",
  "credentials",
  "scope",
  "interview",
] as const;
export type AdmissionGate = (typeof admissionGateKeys)[number];
export const admissionCoreStageIds = [
  ...admissionGateKeys,
  "publication",
] as const;
export type AdmissionCoreStage = (typeof admissionCoreStageIds)[number];
export type AdmissionStage = { id: string; label: string; core: boolean };
export const defaultAdmissionStages: AdmissionStage[] = [
  { id: "identity", label: "Identidad", core: true },
  { id: "credentials", label: "Credenciales", core: true },
  { id: "scope", label: "País y ámbitos", core: true },
  { id: "interview", label: "Entrevista", core: true },
  { id: "publication", label: "Revisión y publicación", core: true },
];
export type AdmissionReviewer = {
  userId: string;
  email: string;
  isAdmin: boolean;
};
export type AdmissionFormState = {
  ok: boolean;
  message: string;
  code?:
    | "unauthorized"
    | "invalid"
    | "conflict"
    | "ineligible"
    | "unavailable"
    | "blocked";
  published?: boolean;
  field?: "interviewLocal" | "interviewTimeZone" | "interviewReference";
};
export type AdmissionAction = (
  previous: AdmissionFormState,
  form: FormData,
) => Promise<AdmissionFormState>;
export type AdmissionCandidate = {
  professionalId: string;
  name: string;
  email: string;
  country: string | null;
  licenseCountry: string | null;
  stageId: string;
  revision: number;
  profileRevision: string;
  updatedAt: string;
  hasDocument: boolean;
  gates: Record<AdmissionGate, boolean>;
  canPublish: boolean;
};
export type AdmissionDetail = AdmissionCandidate & {
  profile: {
    university: string | null;
    licenseNumber: string | null;
    fpvNumber: string | null;
    fpvVerified: boolean;
    registrationType: string | null;
    registrationDetail: string | null;
    conductAccepted: boolean;
  };
  evidence: { identity: string; credentials: string };
  interview: {
    startsAt: string | null;
    localDateTime: string;
    timeZone: string;
    reference: string;
    completed: boolean;
  };
  scopes: {
    id: string;
    country: string;
    reference: string;
    expiresAt: string;
    reviewedAt: string;
    valid: boolean;
  }[];
  history: {
    id: string;
    createdAt: string;
    actorLabel: string;
    action: string;
    summary: string;
    details?: string[];
  }[];
  historyHasMore: boolean;
  historyPage: number;
  publishBlockers: string[];
};
export type AdmissionBoardData = {
  stages: AdmissionStage[];
  configRevision: number;
  candidates: AdmissionCandidate[];
  selected: AdmissionDetail | null;
  canConfigure: boolean;
  limitedReviewer: boolean;
  page: number;
  hasMore: boolean;
  query: string;
  stageFilter: string;
  stageCounts: Record<string, number>;
};
export type AdmissionActions = {
  saveReview: AdmissionAction;
  saveScope: AdmissionAction;
  moveStage: AdmissionAction;
  publish: AdmissionAction;
  configure: AdmissionAction;
};
