import { usePathname } from "next/navigation";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppFrame } from "@/components/app-frame";
import { PracticeNav } from "@/components/practice/nav";

// Shell, cuenta, navegación y guía reales; sesión y objetivos sólo ficticios.
const targets: Record<string, string[]> = {
  "/pro/consulta": ["calendario"],
  "/pro/pacientes": ["patients-list-title", "patient-create-title"],
  "/pro/mensajes": ["messages-list-title"],
  "/pro/cobros": ["practice-receipt-filters", "practice-receipt-actions"],
  "/pro/ajustes": [
    "practice-settings",
    "reminders-professional",
    "practice-calendar-settings",
  ],
  "/pro/pacientes/persona-ficticia": ["sesiones", "notas"],
};
function Fixture() {
  const pathname = usePathname();
  const heading = (
    <>
      <p className="eyebrow">Consulta ficticia local</p>
      <h1>Espacio de comprobación</h1>
      <p className="lead">
        Objetivos estáticos para revisar la guía, sin registros ni operaciones
        clínicas.
      </p>
    </>
  );
  return (
    <AppFrame
      publicHeader={null}
      publicFooter={null}
      publicStructuredData={null}
    >
      <style>{":root { --font-hanken: system-ui; }"}</style>
      <section className="section">
        <div className="container practice-shell">
          {pathname !== "/pro/cobros" ? heading : null}
          <PracticeNav />
          {pathname === "/pro/cobros" ? heading : null}
          {(targets[pathname] || []).map((id) => (
            <section
              className="workspace-card"
              id={id}
              key={id}
              style={{ minHeight: 340 }}
            >
              <h2>Objetivo estático ficticio</h2>
              <p>
                Esta fixture comprueba posiciones y entrada; no contiene fichas
                o notas reales.
              </p>
            </section>
          ))}
        </div>
      </section>
    </AppFrame>
  );
}
const motion = {
  active: 0,
  paths: [] as Array<{
    target: string | undefined;
    frames: Keyframe[];
    duration: number;
  }>,
};
const nativeAnimate = Element.prototype.animate;
Element.prototype.animate = function (frames, options) {
  const animation = nativeAnimate.call(this, frames, options);
  motion.active++;
  let active = true;
  const release = () => {
    if (active) {
      active = false;
      motion.active--;
    }
  };
  animation.addEventListener("finish", release, { once: true });
  animation.addEventListener("cancel", release, { once: true });
  if (this instanceof HTMLElement && this.dataset.step && animation.effect)
    motion.paths.push({
      target: this.dataset.readingTarget,
      frames: (animation.effect as KeyframeEffect).getKeyframes(),
      duration: Number(animation.effect.getTiming().duration),
    });
  return animation;
};
const timers = new Set<number>();
const timerWindow = window as unknown as {
  setTimeout: (
    handler: TimerHandler,
    timeout?: number,
    ...args: unknown[]
  ) => number;
  clearTimeout: (timer?: number) => void;
};
const nativeTimeout = timerWindow.setTimeout.bind(window);
const nativeClear = timerWindow.clearTimeout.bind(window);
timerWindow.setTimeout = (handler, timeout, ...args) => {
  if (typeof handler !== "function")
    return nativeTimeout(handler, timeout, ...args);
  const id = nativeTimeout(() => {
    timers.delete(id);
    handler(...args);
  }, timeout);
  timers.add(id);
  return id;
};
timerWindow.clearTimeout = (id) => {
  if (id !== undefined) timers.delete(id);
  nativeClear(id);
};
Object.assign(window, {
  practiceGuidePreview: { motion, pendingTimers: () => timers.size },
});

const root = document.getElementById("root");
if (!root) throw new Error("Falta la fixture local de la guía profesional");
createRoot(root).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
