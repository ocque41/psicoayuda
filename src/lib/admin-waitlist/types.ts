export const generalWaitlistStatuses = [
  "waiting",
  "contacted",
  "matched",
  "closed",
] as const;
export type GeneralWaitlistStatus = (typeof generalWaitlistStatuses)[number];
export const generalWaitlistStatusLabels: Record<
  GeneralWaitlistStatus,
  string
> = {
  waiting: "En espera",
  contacted: "Contactada",
  matched: "En acompañamiento",
  closed: "Cerrada",
};
export const helpQueueFilters = [
  "waiting",
  "assigned",
  "review",
  "closed",
] as const;
export const helpQueueFilterLabels: Record<
  (typeof helpQueueFilters)[number],
  string
> = {
  waiting: "En espera",
  assigned: "Con profesional",
  review: "Revisar seguimiento",
  closed: "Cerradas",
};
export type WaitlistTab = "general" | "terremoto";
export type WaitlistAdmin = {
  userId: string;
  email: string;
  sessionId: string;
};
export type AdminWaitlistQuery = Record<string, string | string[] | undefined>;
export type WaitlistListItem = {
  id: string;
  tab: WaitlistTab;
  name: string | null;
  status: string;
  statusLabel: string;
  createdAt: string;
  updatedAt: string;
  activeAssignments: number;
  offeredAssignments: number;
  requiresReview: boolean;
};
export type GeneralWaitlistDetail = WaitlistListItem & {
  tab: "general";
  email: string;
  title: string;
  description: string;
  source: string;
  sourceLabel: string;
};
export type HelpWaitlistDetail = WaitlistListItem & {
  tab: "terremoto";
  email: string;
  country: string | null;
  state: string | null;
  city: string | null;
  language: string;
  languageLabel: string;
  needCategory: string;
  needCategoryLabel: string;
  urgency: string;
  urgencyLabel: string;
  consentContact: boolean;
  assignmentsHasMore: boolean;
  assignments: {
    id: string;
    professionalId: string;
    professionalName: string;
    status: string;
    statusLabel: string;
  }[];
};
export type WaitlistDetail = GeneralWaitlistDetail | HelpWaitlistDetail;
export type AdminWaitlistData = {
  items: WaitlistListItem[];
  page: number;
  pages: number;
  total: number;
  counts: Record<string, number>;
  sourceCounts: Record<WaitlistTab, number>;
  tab: WaitlistTab;
  q: string;
  queryWarning: string | null;
  status: string;
  selected: WaitlistDetail | null;
  failed: boolean;
};
export type WaitlistFormState = {
  ok: boolean;
  message: string;
  code?: "unauthorized" | "invalid" | "conflict" | "unavailable";
  updatedAt?: string;
  status?: GeneralWaitlistStatus;
};
