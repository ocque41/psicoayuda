import { Component, type PropsWithChildren, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { PracticeForm } from "@/components/practice/forms";

type Fixture = {
  mode: string;
  calls: { data: [string, string][]; previous: PracticeFormState }[];
  errors: { digest: string; message: string }[];
  reset: boolean;
  gate: Promise<void> | null;
  hold: () => void;
  release: () => void;
  remount: () => void;
  firstNotice?: Element | null;
};
declare global {
  interface Window {
    fixture: Fixture;
  }
}
const fixture: Fixture = {
  mode: "failure",
  calls: [],
  errors: [],
  reset: false,
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
window.fixture = fixture;
class Boundary extends Component<PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error : new Error("Error ficticio"),
    };
  }
  componentDidCatch(error: Error) {
    fixture.errors.push({
      digest: "digest" in error ? String(error.digest) : "",
      message: error.message,
    });
  }
  render() {
    return this.state.error ? (
      <p id="boundary" role="alert">
        Control de navegación recibido.
      </p>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [epoch, setEpoch] = useState(0);
  fixture.remount = () => setEpoch((value) => value + 1);
  return (
    <Boundary key={epoch}>
      <h1>Formulario ficticio aislado</h1>
      <p>
        React y PracticeForm reales; acción local simulada, sin usuarios ni base
        de datos.
      </p>
      <div id="fixture">
        <PracticeForm
          resetOnSuccess={fixture.reset}
          action={async (previous, data) => {
            const mode = fixture.mode;
            fixture.calls.push({
              data: [...data.entries()].map(([key, value]) => [
                key,
                typeof value === "string" ? value : value.name,
              ]),
              previous,
            });
            if (fixture.gate) await fixture.gate;
            if (mode === "throw") throw new Error("Fallo ficticio privado");
            if (["redirect", "notfound", "http-notfound"].includes(mode))
              throw Object.assign(new Error("Navegación simulada"), {
                digest:
                  mode === "redirect"
                    ? "NEXT_REDIRECT;push;/destino-ficticio;307;"
                    : mode === "notfound"
                      ? "NEXT_NOT_FOUND"
                      : "NEXT_HTTP_ERROR_FALLBACK;404",
              });
            if (mode === "same") return previous;
            if (mode === "null") return null;
            return mode === "success"
              ? { ok: true, message: "Guardado ficticio confirmado." }
              : {
                  ok: false,
                  message: "Revisa el dato ficticio antes de guardar.",
                };
          }}
        >
          <input type="hidden" name="entity" value="fixture-only" />
          <input type="hidden" name="reset" value="fixture-reset-named" />
          <label>
            Importe
            <input name="amount" required />
          </label>
          <label>
            Referencia
            <input
              name="reference"
              defaultValue="Referencia inicial"
              required
            />
          </label>
          <label>
            Método
            <select name="method" defaultValue="cash">
              <option value="cash">Efectivo</option>
              <option value="transfer">Transferencia</option>
            </select>
          </label>
          <label>
            Mensaje
            <textarea name="body" defaultValue="" />
          </label>
          <label>
            <input type="checkbox" name="consent" value="yes" />
            Confirmación ficticia
          </label>
          <label>
            <input type="radio" name="role" value="one" defaultChecked />
            Opción inicial
          </label>
          <label>
            <input type="radio" name="role" value="two" />
            Segunda opción
          </label>
          <label>
            Selección múltiple
            <select name="tags" multiple defaultValue={["a"]}>
              <option value="a">A</option>
              <option value="b">B</option>
              <option value="c">C</option>
            </select>
          </label>
          <label>
            Control bloqueado previamente
            <input name="unavailable" defaultValue="No enviar" disabled />
          </label>
          <label>
            Archivo ficticio
            <input type="file" name="attachment" />
          </label>
          <button type="submit" name="intent" value="alternate">
            Enviar desde botón hijo
          </button>
          <button type="reset">Restablecer</button>
        </PracticeForm>
      </div>
    </Boundary>
  );
}
createRoot(document.getElementById("root") as HTMLElement).render(<App />);
