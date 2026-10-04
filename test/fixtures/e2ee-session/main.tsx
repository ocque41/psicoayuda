import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChatRoom } from "../../../src/app/c/[conversationId]/chat-room";
import { E2eeRestorePanel } from "../../../src/app/c/[conversationId]/e2ee-restore-panel";
import { E2eeBackupModal } from "../../../src/components/e2ee-backup-modal";
import { E2eeProSetupCard } from "../../../src/components/e2ee-pro-setup";
import { loadChatDraft } from "../../../src/lib/chat-draft-storage";
import { completeChatSignOut } from "../../../src/lib/chat-session-end";
import * as client from "../../../src/lib/e2ee-client";
import { openEnvelope } from "../../../src/shared/e2ee";
import { verifyProfessionalE2eeActor } from "./actions";
import type { Fixture } from "./types";

const container = document.getElementById("root");
if (!container) throw new Error("Sin raíz de fixture");
const root = createRoot(container);
const f: Fixture = {
  actor: "fictional-pro-a",
  expiresAt: Date.now() + 900_000,
  backups: new Map(),
  copied: [] as string[],
  downloads: 0,
  check: () => verifyProfessionalE2eeActor("fictional-pro-a"),
  async rejectLogout() {
    try {
      await completeChatSignOut(
        async () => {},
        async () => ({ error: true }),
      );
    } catch {
      // El rechazo debe conservar la sesión y la UI autorizadas.
    }
  },
  frames: [],
  encryptionPending: 0,
  encryptCalls: 0,
  resumeEncryption() {
    f.holdEncryption = false;
    for (const resume of f.encryptions.splice(0)) resume();
  },
  encryptions: [],
  async mountComposer(role = "seeker") {
    const { identity } = await client.getOrCreateIdentity(
      client.seekerSlot("fictional-composer"),
    );
    const peer = await client.getOrCreateIdentity(
      client.professionalSlot("fictional-peer"),
    );
    const backup = await client.createRecoveryBackup(
      client.seekerSlot("fictional-composer"),
    );
    if (!backup) throw new Error("Sin respaldo del compositor ficticio");
    f.backups.set(backup.id, backup.wrapped);
    f.composerRole = role;
    f.actor = "fictional-peer";
    f.seekerKey = identity.publicKey;
    f.peerKey = peer.identity.publicKey;
    root.render(
      <ChatRoom
        conversationId="fictional-composer"
        role={role}
        professionalId={role === "professional" ? "fictional-peer" : undefined}
        paymentLinks={[
          {
            id: "fictional-package",
            title: "Paquete ficticio",
            priceLabel: "Importe ficticio",
          },
        ]}
        otherName="Profesional ficticio"
        open
        proPublicKey={f.peerKey}
      />,
    );
  },
  async readDraft() {
    const role = f.composerRole ?? "seeker";
    const slot =
      role === "professional"
        ? client.professionalSlot("fictional-peer")
        : client.seekerSlot("fictional-composer");
    const identity = await client.loadIdentity(slot);
    if (!identity) throw new Error("Sin identidad ficticia");
    return loadChatDraft(
      {
        ownerId:
          role === "professional" ? "fictional-peer" : "fictional-composer",
        conversationId: "fictional-composer",
        role,
      },
      identity,
    );
  },
  async sentTexts() {
    const role = f.composerRole ?? "seeker";
    const recipient = await client.loadIdentity(
      role === "professional"
        ? client.seekerSlot("fictional-composer")
        : client.professionalSlot("fictional-peer"),
    );
    if (!recipient) throw new Error("Sin destinatario ficticio");
    return Promise.all(
      f.frames
        .filter((frame) => frame.type === "send")
        .map((frame) =>
          openEnvelope({
            identity: recipient,
            conversationId: "fictional-composer",
            senderRole: role,
            content: frame.content,
          }),
        ),
    );
  },
  async mount(kind = "card", id = "fictional-pro-a") {
    f.actor = id;
    if (kind === "restore") {
      await client.getOrCreateIdentity(client.professionalSlot(id));
      const backup = await client.createRecoveryBackup(
        client.professionalSlot(id),
      );
      if (!backup) throw new Error("Sin respaldo ficticio");
      f.restoreCode = backup.code;
      f.backups.set(backup.id, backup.wrapped);
      f.snapshot = await client.exportKeystoreJson();
      root.render(
        <StrictMode>
          <E2eeRestorePanel
            audience="professional"
            recoveryScope={client.professionalSlot(id)}
            checkActor={f.check}
            onRestored={async () => {
              f.restored = true;
              return true;
            }}
            onUseNewKeys={async () => {
              f.rotated = true;
            }}
          />
        </StrictMode>,
      );
    } else if (kind === "modal") {
      root.render(
        <StrictMode>
          <E2eeBackupModal
            code="FICTIONALRECOVERYCODE"
            checkActor={f.check}
            onClose={() => root.render(null)}
          />
        </StrictMode>,
      );
    } else {
      const { identity } = await client.getOrCreateIdentity(
        client.professionalSlot(id),
      );
      root.render(
        <StrictMode>
          <E2eeProSetupCard
            professionalId={id}
            accountPublicKey={identity.publicKey}
          />
        </StrictMode>,
      );
    }
  },
  keys: () => client.exportKeystoreJson(),
  async snapshotBackup() {
    const json = await client.exportKeystoreJson();
    const code = await client.getStoredRecoveryCode(
      client.professionalSlot("fictional-pro-a"),
    );
    return JSON.stringify({ json, code, backups: [...f.backups] });
  },
};
window.fixture = f;
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async (value: string) => {
      f.copied.push(value);
    },
  },
});
document.addEventListener("click", (event) => {
  const link = (event.target as Element)?.closest("a[download]");
  if (link) {
    event.preventDefault();
    f.downloads += 1;
  }
});
const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
crypto.subtle.encrypt = async (
  ...args: Parameters<SubtleCrypto["encrypt"]>
) => {
  const parameters = args[0] as AesGcmParams;
  f.encryptCalls += 1;
  const aad = parameters.additionalData
    ? new TextDecoder().decode(parameters.additionalData)
    : "";
  if (f.holdEncryption && aad.startsWith("fictional-composer")) {
    f.encryptionPending += 1;
    await new Promise<void>((resolve) => {
      f.encryptions.push(resolve);
    });
    if (f.failEncryption) throw new Error("Fallo criptográfico ficticio");
  }
  return encrypt(...args);
};
class FixtureWebSocket {
  static OPEN = 1;
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor() {
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
      this.onmessage?.({
        data: JSON.stringify({ type: "history", messages: [], hasMore: false }),
      });
      this.onmessage?.({
        data: JSON.stringify({
          type: "keys",
          keys: { professional: f.peerKey, seeker: f.seekerKey },
        }),
      });
    }, 10);
  }
  send(raw: string) {
    f.frames.push(JSON.parse(raw));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
Object.defineProperty(window, "WebSocket", {
  configurable: true,
  value: FixtureWebSocket,
});
window.ready = f.mount();
