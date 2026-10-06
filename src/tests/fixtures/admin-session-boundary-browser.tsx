import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { WaitlistDialog } from "@/components/admin/waitlist/dialog-frame";
import { AdminDeleteAccountForm } from "@/components/admin-delete-account-form";
import { AdmissionDialog } from "@/components/admission/dialog-frame";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";
import { NoteEditor } from "@/components/practice/note-editor";
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  announceAccountSessionChange,
  announceChatSessionEnd,
  bridgeChatSessionEnd,
} from "@/lib/chat-session-end";

// Sólo documentos/contactos ficticios en loopback, sin proveedores ni escrituras.
const fixture = {
  signals: 0,
  closes: 0,
  announce: announceAccountSessionChange,
  logout: announceChatSessionEnd,
};
Object.assign(window, { adminFixture: fixture });
window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, () => fixture.signals++);
window.addEventListener("close", () => fixture.closes++, true);
bridgeChatSessionEnd();

function PrivateAdministration({ professional }: { professional: boolean }) {
  const [dialog, setDialog] = useState<"admission" | "waitlist" | null>(null);
  const [note, setNote] = useState("Borrador de admisión ficticio");
  const [status, setStatus] = useState("pending");
  const [dirty, setDirty] = useState(false);
  const close = () => setDialog(null);
  return (
    <section data-private-administration>
      <h1>Administración privada ficticia</h1>
      <p data-private-credentials>Credencial ficticia de la cuenta A</p>
      <p data-private-waitlist>Contacto ficticio: espera@example.invalid</p>
      <button type="button" onClick={() => setDialog("admission")}>
        Revisar credencial ficticia
      </button>
      <button type="button" onClick={() => setDialog("waitlist")}>
        Abrir lista de espera ficticia
      </button>
      <AdminDeleteAccountForm
        userId="fictional-account-only"
        accountLabel="Cuenta ficticia A"
        action={async () => {
          throw new Error("La fixture nunca debe enviar una eliminación.");
        }}
      />
      {professional ? (
        <>
          <NoteEditor
            accountId="fictional-admin-a"
            professionalId="fictional-professional-a"
            patientId="fictional-patient-a"
            appointmentId="fictional-session-a"
            note={{
              id: "fictional-note-a",
              content: "Nota inicial ficticia A",
              revision: 1,
              updatedAt: "2026-10-06T12:00:00.000Z",
            }}
          />
          <a href="/another-fictional-profile">Otra ficha ficticia</a>
        </>
      ) : null}
      {dialog === "admission" ? (
        <AdmissionDialog
          title="Credencial privada ficticia"
          description="identidad@example.invalid"
          onClose={close}
          dirty={dirty}
        >
          <p>Identidad ficticia A — referencia ficticia 000</p>
          <label htmlFor="fictional-admission-note">
            Nota de admisión ficticia
          </label>
          <textarea
            id="fictional-admission-note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setDirty(true);
            }}
          />
        </AdmissionDialog>
      ) : dialog === "waitlist" ? (
        <WaitlistDialog
          title="Contacto privado ficticio A"
          source="Apoyo general ficticio"
          onClose={close}
          dirty={dirty}
        >
          <p>Contacto ficticio A: espera@example.invalid</p>
          <label htmlFor="fictional-waitlist-status">
            Seguimiento ficticio
          </label>
          <select
            id="fictional-waitlist-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setDirty(true);
            }}
          >
            <option value="pending">Pendiente</option>
            <option value="contacted">Contactado</option>
          </select>
        </WaitlistDialog>
      ) : null}
    </section>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Falta raíz ficticia");
const requestedAudience = new URL(window.location.href).searchParams.get(
  "audience",
);
const audience =
  requestedAudience === "professional" || requestedAudience === "patient"
    ? requestedAudience
    : "administration";
createRoot(container).render(
  <StrictMode>
    <PatientSessionBoundary ownerId="fictional-admin-a" audience={audience}>
      <PrivateAdministration professional={audience === "professional"} />
    </PatientSessionBoundary>
  </StrictMode>,
);
