import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BirdGuide } from "@/components/demo/bird-guide";

const sections = [
  "agenda",
  "pacientes",
  "notas",
  "mensajes",
  "cobros",
  "cierre",
];
const fixture = {
  steps: [] as string[],
  resources: { resize: 0, mutation: 0, listeners: 0 },
  motion: {
    created: 0,
    active: 0,
    paths: [] as Array<{ transforms: string[]; duration: number }>,
  },
  remount: () => {},
  control: () => {},
  setStep: (_step: string) => {},
  setHidden: (_hidden: boolean | null) => {},
};
Object.assign(window, { fixture });
const nativeAnimate = Element.prototype.animate;
Element.prototype.animate = function (keyframes, options) {
  const animation = nativeAnimate.call(this, keyframes, options);
  fixture.motion.created++;
  fixture.motion.active++;
  let active = true;
  const release = () => {
    if (!active) return;
    active = false;
    fixture.motion.active--;
  };
  animation.addEventListener("finish", release, { once: true });
  animation.addEventListener("cancel", release, { once: true });
  if (this instanceof HTMLElement && this.dataset.step && animation.effect) {
    fixture.motion.paths.push({
      transforms: (animation.effect as KeyframeEffect)
        .getKeyframes()
        .map((frame) => String(frame.transform)),
      duration: Number(animation.effect.getTiming().duration),
    });
  }
  return animation;
};
fixture.setHidden = (hidden) => {
  if (hidden === null) Reflect.deleteProperty(document, "hidden");
  else
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => hidden,
    });
  document.dispatchEvent(new Event("visibilitychange"));
};
const nativeAdd = EventTarget.prototype.addEventListener;
const nativeRemove = EventTarget.prototype.removeEventListener;
const listeners = new Map<
  EventTarget,
  Map<string, Set<EventListenerOrEventListenerObject>>
>();
function tracked(target: EventTarget, type: string) {
  return (
    (target === window ||
      target === document ||
      target === window.visualViewport ||
      target instanceof MediaQueryList) &&
    ["resize", "scroll", "keydown", "change", "visibilitychange"].includes(type)
  );
}
EventTarget.prototype.addEventListener = function (type, listener, options) {
  if (listener && tracked(this, type)) {
    const key = `${type}:${typeof options === "boolean" ? options : Boolean(options?.capture)}`;
    const targetListeners =
      listeners.get(this) ||
      new Map<string, Set<EventListenerOrEventListenerObject>>();
    const entries =
      targetListeners.get(key) || new Set<EventListenerOrEventListenerObject>();
    if (!entries.has(listener)) fixture.resources.listeners++;
    entries.add(listener);
    targetListeners.set(key, entries);
    listeners.set(this, targetListeners);
  }
  nativeAdd.call(this, type, listener, options);
};
EventTarget.prototype.removeEventListener = function (type, listener, options) {
  if (listener && tracked(this, type)) {
    const key = `${type}:${typeof options === "boolean" ? options : Boolean(options?.capture)}`;
    if (listeners.get(this)?.get(key)?.delete(listener))
      fixture.resources.listeners--;
  }
  nativeRemove.call(this, type, listener, options);
};
const NativeResizeObserver = window.ResizeObserver;
const NativeMutationObserver = window.MutationObserver;
window.ResizeObserver = class extends NativeResizeObserver {
  active = true;
  constructor(callback: ResizeObserverCallback) {
    super(callback);
    fixture.resources.resize++;
  }
  disconnect() {
    if (this.active) fixture.resources.resize--;
    this.active = false;
    super.disconnect();
  }
};
window.MutationObserver = class extends NativeMutationObserver {
  active = true;
  constructor(callback: MutationCallback) {
    super(callback);
    fixture.resources.mutation++;
  }
  disconnect() {
    if (this.active) fixture.resources.mutation--;
    this.active = false;
    super.disconnect();
  }
};
function Fixture() {
  const [draft, setDraft] = useState("");
  const [mounted, setMounted] = useState(true);
  const [controlled, setControlled] = useState(false);
  const [selectedStep, setSelectedStep] = useState("agenda");
  fixture.remount = () => setMounted((value) => !value);
  fixture.control = () => setControlled(true);
  fixture.setStep = (step) => setSelectedStep(step);
  return (
    <main>
      <h1>Consulta completamente ficticia</h1>
      {mounted ? (
        <BirdGuide
          stepId={controlled ? selectedStep : undefined}
          steps={sections.map((name) => ({
            id: name,
            targetId: `demo-${name}`,
            title: `Conoce ${name}`,
            description:
              "Explora esta sección ficticia. Los controles siguen disponibles y no se envía ni guarda información fuera de esta página.",
          }))}
          onStepChange={(step) => {
            fixture.steps.push(step.id);
            if (controlled) setSelectedStep(step.id);
          }}
        />
      ) : null}
      {sections.map((name) => (
        <section
          id={`demo-${name}`}
          key={name}
          hidden={controlled && selectedStep !== name}
          style={{
            marginTop: 72,
            padding: 24,
            minHeight: 220,
            border: "1px solid #e7decf",
            borderRadius: 20,
            background: "white",
          }}
        >
          <h2>{name}</h2>
          <label>
            Borrador ficticio
            <input
              id={`input-${name}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => setDraft("Cambio ficticio")}>
            Probar {name}
          </button>
        </section>
      ))}
    </main>
  );
}
const container = document.getElementById("root");
if (!container) throw new Error("Falta el contenedor de la prueba ficticia");
createRoot(container).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
