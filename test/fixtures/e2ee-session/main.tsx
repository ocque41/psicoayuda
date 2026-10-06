import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { E2eeRestorePanel } from "../../../src/app/c/[conversationId]/e2ee-restore-panel";
import { E2eeBackupModal } from "../../../src/components/e2ee-backup-modal";
import { E2eeProSetupCard } from "../../../src/components/e2ee-pro-setup";
import * as client from "../../../src/lib/e2ee-client";
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
window.ready = f.mount();
