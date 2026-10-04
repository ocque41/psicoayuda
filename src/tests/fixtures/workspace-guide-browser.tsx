import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PracticeNav } from "@/components/practice/nav";

// Navegación y guía de producción; objetivos estáticos sin cuenta ni BD.
function Fixture() {
  return (
    <>
      <header
        data-workspace-header
        style={{
          position: "fixed",
          inset: "0 0 auto",
          height: 70,
          background: "#fffdf8",
          zIndex: 50,
        }}
      >
        Nido · comprobación local
      </header>
      <main
        className="container practice-shell"
        style={{ paddingTop: 90, paddingBottom: 130 }}
      >
        <PracticeNav />
        <h1>Ficha de ejemplo ficticia</h1>
        <section
          className="workspace-card"
          id="sesiones"
          style={{ minHeight: 760 }}
        >
          <h2>Sesiones de ejemplo</h2>
          <p>Esta fixture sólo comprueba la colocación de la guía.</p>
          <label>
            Borrador ficticio
            <input id="fixture-draft" defaultValue="" />
          </label>
          <button type="button">Acción de ejemplo</button>
        </section>
        <section
          className="workspace-card"
          id="notas"
          style={{ minHeight: 400 }}
        >
          <h2>Notas de ejemplo</h2>
          <p>No se guarda ni envía información.</p>
        </section>
      </main>
    </>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("No se encontró la fixture local");
createRoot(root).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
