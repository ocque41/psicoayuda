import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";
import { PatientProfileEditor } from "@/components/practice/patient-profile-editor";
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  announceAccountSessionChange,
  announceChatSessionEnd,
  bridgeChatSessionEnd,
} from "@/lib/chat-session-end";

// Sólo ejemplos locales: la consulta de sesión usa HTTP real en loopback.
const fixture = {
  signals: 0,
  announce: announceAccountSessionChange,
  logout: announceChatSessionEnd,
  setOwner: (_owner: string) => {},
};
Object.assign(window, { accountFixture: fixture });
window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, () => fixture.signals++);
bridgeChatSessionEnd();

function PrivateWorkspace({ owner }: { owner: string }) {
  const [note, setNote] = useState(`Nota ficticia de ${owner}`);
  return (
    <section data-private-workspace>
      <h1>Consulta privada ficticia</h1>
      <p data-private-calendar>Calendario privado ficticio de {owner}</p>
      <p data-private-inbox>Bandeja privada ficticia de {owner}</p>
      <label htmlFor="fictional-session-note">Nota de sesión ficticia</label>
      <textarea
        id="fictional-session-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <PatientProfileEditor
        key={owner}
        patientId={`patient-${owner}`}
        timeZone="America/Caracas"
        profile={{
          status: "ready",
          revision: 1,
          content: {
            sex: "",
            birthDate: "",
            consultationReason: `Motivo de consulta ficticio de ${owner}`,
            generalNote: `Nota general ficticia de ${owner}`,
          },
        }}
      />
    </section>
  );
}

function Fixture() {
  const [owner, setOwner] = useState("fictional-owner-a");
  fixture.setOwner = setOwner;
  return (
    <PatientSessionBoundary key={owner} ownerId={owner} audience="professional">
      <PrivateWorkspace owner={owner} />
    </PatientSessionBoundary>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Falta raíz ficticia");
createRoot(container).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
