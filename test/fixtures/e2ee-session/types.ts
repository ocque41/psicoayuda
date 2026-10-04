import type { ClientFrame } from "../../../src/shared/chat-protocol";
export interface Fixture {
  frames: ClientFrame[];
  encryptionPending: number;
  encryptCalls: number;
  holdEncryption?: boolean;
  failEncryption?: boolean;
  encryptions: (() => void)[];
  resumeEncryption: () => void;
  composerRole?: "seeker" | "professional";
  mountComposer: (role?: "seeker" | "professional") => Promise<void>;
  readDraft: () => Promise<string | null>;
  sentTexts: () => Promise<(string | null)[]>;
  peerKey?: string;
  seekerKey?: string;
  actor: string;
  expiresAt: number;
  backups: Map<string, string>;
  copied: string[];
  downloads: number;
  holdAuth?: boolean;
  holdSave?: boolean;
  holdLoad?: boolean;
  authPending?: boolean;
  savePending?: boolean;
  loadPending?: boolean;
  releaseAuth?: () => void;
  releaseSave?: () => void;
  releaseLoad?: () => void;
  restoreCode?: string;
  snapshot?: string;
  restored?: boolean;
  rotated?: boolean;
  check: () => Promise<{ ok: boolean; expiresAt: number }>;
  mount: (kind?: string, id?: string) => Promise<void>;
  keys: () => Promise<string>;
  snapshotBackup: () => Promise<string>;
  rejectLogout: () => Promise<void>;
}
declare global {
  interface Window {
    fixture: Fixture;
    ready: Promise<void>;
  }
}
