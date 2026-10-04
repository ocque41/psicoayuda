export interface Fixture {
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
}
declare global {
  interface Window {
    fixture: Fixture;
    ready: Promise<void>;
  }
}
