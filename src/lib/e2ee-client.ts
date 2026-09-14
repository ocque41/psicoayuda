import {
  type ConversationIdentity,
  exportPrivateKeyJwk,
  generateIdentityKeyPair,
  generateRecoveryCode,
  importPrivateKeyJwk,
  type KeystoreEntry,
  type KeystoreFile,
  normalizeRecoveryCode,
  parseKeystore,
  recoveryIdFor,
  toConversationIdentity,
  unwrapKeystore,
  wrapKeystore,
} from "@/shared/e2ee";

// Keystore local del E2EE (IndexedDB). Guarda las claves privadas SOLO en este
// dispositivo y, si el usuario respaldó, una copia del código de recuperación
// para re-cifrar el respaldo cuando se añaden claves nuevas. Si IndexedDB no
// está disponible (modo privado, permisos), cae a memoria: el chat funciona
// durante la sesión, sin persistencia.
//
// Este módulo es SOLO para el navegador (componentes "use client").

const DB_NAME = "nido-e2ee";
const DB_VERSION = 1;
const STORE_KEYS = "keys";
const STORE_META = "meta";

/** Slot de la clave de identidad del profesional (una para todas sus salas). */
export const PRO_SLOT = "pro";
/** Slot de la clave de una conversación concreta para la persona. */
export function seekerSlot(conversationId: string): string {
  return `seek:${conversationId}`;
}

const memoryKeys = new Map<string, KeystoreEntry>();
const memoryMeta = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          db.createObjectStore(STORE_KEYS, { keyPath: "slot" });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(storeName, mode);
        const request = action(tx.objectStore(storeName));
        request.onsuccess = () => resolve((request.result as T) ?? null);
        request.onerror = () => resolve(null);
        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

async function getStoredKey(slot: string): Promise<KeystoreEntry | null> {
  const row = await runRequest<KeystoreEntry>(STORE_KEYS, "readonly", (store) =>
    store.get(slot),
  );
  return row ?? memoryKeys.get(slot) ?? null;
}

async function putStoredKey(entry: KeystoreEntry): Promise<void> {
  memoryKeys.set(entry.slot, entry);
  await runRequest(STORE_KEYS, "readwrite", (store) => store.put(entry));
}

async function listStoredKeys(): Promise<KeystoreEntry[]> {
  const rows =
    (await runRequest<KeystoreEntry[]>(STORE_KEYS, "readonly", (store) =>
      store.getAll(),
    )) ?? [];
  if (rows.length === 0 && memoryKeys.size > 0) return [...memoryKeys.values()];
  return rows;
}

async function deleteStoredKey(slot: string): Promise<void> {
  memoryKeys.delete(slot);
  await runRequest(STORE_KEYS, "readwrite", (store) => store.delete(slot));
}

export async function getStoredRecoveryCode(): Promise<string | null> {
  const row = await runRequest<{ key: string; value: string }>(
    STORE_META,
    "readonly",
    (store) => store.get("recoveryCode"),
  );
  return row?.value ?? memoryMeta.get("recoveryCode") ?? null;
}

export async function putStoredRecoveryCode(code: string): Promise<void> {
  memoryMeta.set("recoveryCode", code);
  await runRequest(STORE_META, "readwrite", (store) =>
    store.put({ key: "recoveryCode", value: code }),
  );
}

async function identityFromEntry(
  entry: KeystoreEntry,
): Promise<ConversationIdentity> {
  return {
    privateKey: await importPrivateKeyJwk(entry.privateKey),
    publicKey: entry.publicKey,
  };
}

/** Carga la identidad de un slot, o null si este dispositivo no la tiene. */
export async function loadIdentity(
  slot: string,
): Promise<ConversationIdentity | null> {
  const entry = await getStoredKey(slot);
  if (!entry) return null;
  try {
    return await identityFromEntry(entry);
  } catch {
    return null;
  }
}

/** Devuelve la identidad del slot, creándola (en este dispositivo) si falta. */
export async function getOrCreateIdentity(slot: string): Promise<{
  identity: ConversationIdentity;
  entry: KeystoreEntry;
  created: boolean;
}> {
  const existing = await getStoredKey(slot);
  if (existing) {
    try {
      return {
        identity: await identityFromEntry(existing),
        entry: existing,
        created: false,
      };
    } catch {
      // Clave corrupta: se regenera (el historial cifrado con ella se pierde).
    }
  }
  const pair = await generateIdentityKeyPair();
  const identity = await toConversationIdentity(pair);
  const entry: KeystoreEntry = {
    slot,
    publicKey: identity.publicKey,
    privateKey: await exportPrivateKeyJwk(pair.privateKey),
    createdAt: new Date().toISOString(),
  };
  await putStoredKey(entry);
  return { identity, entry, created: true };
}

/** Crea una identidad NUEVA para el slot, descartando la anterior. La usa el
 *  flujo de "continuar sin recuperar": el historial cifrado con la clave
 *  anterior deja de ser legible en este dispositivo. */
export async function replaceIdentity(slot: string): Promise<{
  identity: ConversationIdentity;
  entry: KeystoreEntry;
  created: boolean;
}> {
  await deleteStoredKey(slot);
  return getOrCreateIdentity(slot);
}

/** Snapshot del keystore completo (todas las claves de este dispositivo). */
export async function exportKeystoreJson(): Promise<string> {
  const entries = await listStoredKeys();
  const file: KeystoreFile = { v: 1, entries };
  return JSON.stringify(file);
}

/** Importa un keystore restaurado; devuelve cuántas claves se añadieron. */
export async function importKeystoreJson(json: string): Promise<number> {
  const file = parseKeystore(json);
  if (!file) return 0;
  let count = 0;
  for (const entry of file.entries) {
    await putStoredKey(entry);
    count += 1;
  }
  return count;
}

/**
 * Crea (o regenera) el respaldo cifrado con un código NUEVO. Guarda el código
 * en este dispositivo para poder re-cifrar el respaldo cuando se añadan claves.
 */
export async function createRecoveryBackup(): Promise<{
  code: string;
  id: string;
  wrapped: string;
} | null> {
  const code = generateRecoveryCode();
  const id = await recoveryIdFor(code);
  if (!id) return null;
  const wrapped = await wrapKeystore(await exportKeystoreJson(), code);
  await putStoredRecoveryCode(code);
  return { code, id, wrapped };
}

/**
 * Re-cifra el keystore con el código ya guardado en este dispositivo (por
 * ejemplo, tras añadir la clave de una conversación nueva). Devuelve null si
 * nunca hubo respaldo (no se puede inventar el código).
 */
export async function refreshRecoveryBackup(): Promise<{
  id: string;
  wrapped: string;
} | null> {
  const code = await getStoredRecoveryCode();
  if (!code) return null;
  const id = await recoveryIdFor(code);
  if (!id) return null;
  const wrapped = await wrapKeystore(await exportKeystoreJson(), code);
  return { id, wrapped };
}

/** Restaura un keystore con el código del usuario y lo guarda en el dispositivo. */
export async function restoreFromBackup(
  codeInput: string,
  wrapped: string,
): Promise<{ ok: boolean; restored: number }> {
  const json = await unwrapKeystore(wrapped, codeInput);
  if (!json) return { ok: false, restored: 0 };
  const normalized = normalizeRecoveryCode(codeInput);
  if (!normalized) return { ok: false, restored: 0 };
  const restored = await importKeystoreJson(json);
  if (restored === 0) return { ok: false, restored: 0 };
  await putStoredRecoveryCode(normalized);
  return { ok: true, restored };
}
