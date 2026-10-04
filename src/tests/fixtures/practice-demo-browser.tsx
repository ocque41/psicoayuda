import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PracticeDemo } from "@/components/demo/practice-demo";

// PracticeDemo real y sus ejemplos locales. Sin cuenta, BD ni acciones de servidor.
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
  demoPreview: { motion, pendingTimers: () => timers.size },
});
const root = document.getElementById("root");
if (!root) throw new Error("Falta el contenedor del preview local");
createRoot(root).render(
  <StrictMode>
    <PracticeDemo initialMonth="2026-10" />
  </StrictMode>,
);
