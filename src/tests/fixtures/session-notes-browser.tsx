import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NoteEditor } from "@/components/practice/note-editor";
import { SessionNotesReminder } from "@/components/practice/session-notes-reminder";

type Fixture = {
  mode: "success" | "conflict" | "throw";
  existing: boolean;
  enabled: boolean;
  count: number;
  calls: { kind: string; input: unknown }[];
  gate: Promise<void> | null;
  hold: () => void;
  release: () => void;
  remount: () => void;
};
declare global {
  interface Window {
    nidoNotesFixture: Fixture;
  }
}
const fixture: Fixture = {
  mode: "success",
  existing: true,
  enabled: true,
  count: 1,
  calls: [],
  gate: null,
  hold() {
    fixture.gate = new Promise((resolve) => {
      fixture.release = () => {
        fixture.gate = null;
        resolve();
      };
    });
  },
  release() {},
  remount() {},
};
window.nidoNotesFixture = fixture;
function App() {
  const [epoch, setEpoch] = useState(0);
  fixture.remount = () => setEpoch((value) => value + 1);
  return (
    <main className="page-shell" key={epoch} data-fixture-epoch={epoch}>
      <h1>Notas de sesión · fixture ficticia</h1>
      <p>
        Componentes y React reales. Acciones simuladas, sin BD ni proveedores.
      </p>
      <SessionNotesReminder
        reminder={{
          appointmentId: "fixture-session",
          patientId: "fixture-patient",
          endsAt: "2026-10-04T12:00:00.000Z",
          href: "/pro/pacientes/fixture-patient?notaSesion=fixture-session#notas",
          title: "Tu sesión terminó",
          body: "¿Quieres dejar tus apuntes? Las notas de este encuentro tienen su propio espacio privado.",
        }}
        endedLabel="4 de octubre, 14:00"
      />
      <section id="notas" className="card">
        {Array.from(
          { length: fixture.count },
          (_, index) => `fixture-note-${index}`,
        ).map((noteId, index) => (
          <NoteEditor
            key={noteId}
            patientId="fixture-patient"
            appointmentId="fixture-session"
            enabled={fixture.enabled}
            note={
              fixture.existing
                ? {
                    id: noteId,
                    content: index
                      ? "Segundo apunte ficticio inicial"
                      : "Apunte ficticio inicial",
                    revision: 1,
                    updatedAt: "2026-10-04T12:00:00.000Z",
                  }
                : undefined
            }
          />
        ))}
      </section>
      <a href="/otra-ficha">Otra ficha ficticia</a>
      <form action="/" data-note-navigation>
        <label htmlFor="fixture-filter">Fecha de sesiones</label>
        <input id="fixture-filter" name="notaDia" defaultValue="2026-10-04" />
        <button type="submit">Filtrar sesiones</button>
      </form>
    </main>
  );
}
createRoot(document.getElementById("root") as HTMLElement).render(<App />);
