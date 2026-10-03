"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./bird-guide.module.css";

export type BirdGuideStep = {
  id: string;
  targetId: string;
  title: string;
  description: string;
};

type BirdGuideProps = {
  steps: BirdGuideStep[];
  stepId?: string;
  onStepChange?: (step: BirdGuideStep, index: number) => void;
  triggerLabel?: string;
  guideLabel?: string;
};

/** Ilustración vectorial original: salvia, verde y el pequeño acento dorado de Nido. */
function Bird() {
  return (
    <span className={styles.birdArt} aria-hidden="true">
      <span className={styles.tail}>
        <svg
          viewBox="0 0 26 30"
          fill="none"
          focusable="false"
          aria-hidden="true"
        >
          <path d="m25 8-23 20 5-25" fill="#c5ddc5" />
        </svg>
      </span>
      <svg viewBox="0 0 88 80" fill="none" focusable="false" aria-hidden="true">
        <path
          d="M19 39c0-11 9-19 20-19 9 0 11 7 18 7 12 0 20 8 20 17 0 16-14 24-30 24-17 0-28-11-28-29Z"
          fill="#c5ddc5"
          stroke="#245f47"
          strokeWidth="2"
        />
        <path
          d="M27 50c6 13 26 17 38 4-6 2-9-2-14-1-8 1-11 3-24-3Z"
          fill="#f9f5ec"
        />
        <path d="m74 35 11 5-11 5Z" fill="#c69224" />
        <path
          d="m41 67-2 6m12-6 2 6"
          stroke="#c69224"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="m24 18 4-4m-11 9-5 1"
          stroke="#c69224"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <span className={styles.eye} />
      <span className={styles.wing}>
        <svg
          viewBox="0 0 44 42"
          fill="none"
          focusable="false"
          aria-hidden="true"
        >
          <path d="M37 37C10 33 3 16 7 3c16 2 29 14 30 34Z" fill="#2f7a5b" />
          <path
            d="M14 12c5 7 10 13 17 19"
            stroke="#c5ddc5"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </span>
  );
}

function Arrow({ previous = false }: { previous?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={previous ? "M15 10H5m5-5-5 5 5 5" : "M5 10h10m-5-5 5 5-5 5"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Guía no modal: el recorrido acompaña a la demo sin bloquear sus controles. */
export function BirdGuide({
  steps,
  stepId: selectedStepId,
  onStepChange,
  triggerLabel = "Conocer mi consulta",
  guideLabel = "Tu consulta",
}: BirdGuideProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [targetVisible, setTargetVisible] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const birdRef = useRef<HTMLSpanElement>(null);
  const poseRef = useRef<HTMLSpanElement>(null);
  const birdPositionRef = useRef<{ x: number; y: number } | null>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);
  const selectedIndex = selectedStepId
    ? steps.findIndex((candidate) => candidate.id === selectedStepId)
    : -1;
  const currentIndex =
    selectedIndex >= 0
      ? selectedIndex
      : Math.min(index, Math.max(0, steps.length - 1));
  const step = steps[currentIndex];
  const active = open && Boolean(step);
  const targetId = step?.targetId;
  const stepId = step?.id;

  function selectStep(next: number) {
    const nextIndex = Math.min(Math.max(0, next), steps.length - 1);
    const nextStep = steps[nextIndex];
    if (!nextStep) return;
    onStepChange?.(nextStep, nextIndex);
    setIndex(nextIndex);
    setCollapsed(false);
  }

  function start() {
    birdPositionRef.current = null;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : triggerRef.current;
    selectStep(0);
    setOpen(true);
  }

  useEffect(() => {
    if (!active) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (
        document.activeElement instanceof Element &&
        document.activeElement.closest("dialog[open], [aria-modal='true']")
      )
        return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      if (returnFocusRef.current?.isConnected)
        returnFocusRef.current.focus({ preventScroll: true });
    };
  }, [active]);

  useEffect(() => {
    if (!active || !targetId) return;
    const panel = panelRef.current;
    const birdElement = birdRef.current;
    const poseElement = poseRef.current;
    const highlight = highlightRef.current;
    if (!panel || !birdElement || !poseElement || !highlight) return;
    const bird = birdElement;
    const pose = poseElement;
    const navbar = document.querySelector<HTMLElement>(
      "[data-workspace-header], header.topbar",
    );
    const navigation = document.querySelector<HTMLElement>(
      "[data-workspace-navigation]",
    );
    bird.dataset.step = stepId;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let landingTimer = 0;
    let retargetTimer = 0;
    let flight: Animation | null = null;
    let tilt: Animation | null = null;
    let flightStart = 0;
    let flightEnd = 0;
    let lastRetarget = 0;
    let flightDestination = { x: 0, y: 0 };
    let arrived = false;
    let target: HTMLElement | null = null;
    let scrolled = false;
    let closed = false;
    if (!bird.dataset.positioned) {
      const origin = triggerRef.current?.getBoundingClientRect();
      const position =
        birdPositionRef.current ||
        (origin ? { x: origin.left, y: origin.top } : null);
      if (position) {
        bird.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
        birdPositionRef.current = position;
      }
      bird.dataset.positioned = "true";
    }

    const motionAllowed = () =>
      !document.hidden &&
      !reduced.matches &&
      !(navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData &&
      typeof bird.animate === "function";
    function cancelFlight(keepPosition = false) {
      if (flight) {
        if (keepPosition && bird.isConnected) {
          const transform = getComputedStyle(bird).transform;
          if (transform !== "none") {
            bird.style.transform = transform;
            const matrix = new DOMMatrixReadOnly(transform);
            birdPositionRef.current = { x: matrix.m41, y: matrix.m42 };
          }
        }
        flight.onfinish = null;
        flight.cancel();
        flight = null;
      }
      tilt?.cancel();
      tilt = null;
      clearTimeout(retargetTimer);
      retargetTimer = 0;
    }
    function rest() {
      cancelFlight(true);
      clearTimeout(landingTimer);
      arrived = true;
      bird.dataset.flying = "false";
      bird.dataset.phase = "rest";
    }
    function moveBird(
      x: number,
      y: number,
      bounds: { left: number; right: number; top: number; bottom: number },
      visible: boolean,
    ) {
      const destination = `translate3d(${x}px, ${y}px, 0)`;
      const position = !flight ? birdPositionRef.current : null;
      if (!visible) {
        cancelFlight(true);
        clearTimeout(landingTimer);
        bird.dataset.flying = "false";
        bird.dataset.phase = "rest";
        return;
      }
      if (!motionAllowed()) {
        rest();
        bird.style.transform = destination;
        birdPositionRef.current = { x, y };
        return;
      }
      if (arrived) {
        bird.style.transform = destination;
        birdPositionRef.current = { x, y };
        return;
      }
      const now = performance.now();
      const changed = Math.hypot(
        x - flightDestination.x,
        y - flightDestination.y,
      );
      if (flight && changed < 5) {
        bird.style.transform = destination;
        return;
      }
      if (flight && now - lastRetarget < 90) {
        bird.style.transform = destination;
        if (!retargetTimer)
          retargetTimer = window.setTimeout(
            () => {
              retargetTimer = 0;
              schedule();
            },
            90 - (now - lastRetarget),
          );
        return;
      }
      // En reposo la posición propia es la referencia; solo leer el estilo
      // interpolado cuando existe un vuelo que se está redirigiendo.
      const matrix = new DOMMatrixReadOnly(
        flight
          ? getComputedStyle(bird).transform
          : bird.style.transform || "none",
      );
      const clamp = (value: number, min: number, max: number) =>
        Math.min(Math.max(min, max), Math.max(min, value));
      const fromX = clamp(position?.x ?? matrix.m41, bounds.left, bounds.right);
      const fromY = clamp(position?.y ?? matrix.m42, bounds.top, bounds.bottom);
      const dx = x - fromX;
      const dy = y - fromY;
      const distance = Math.hypot(dx, dy);
      if (!flightStart) {
        flightStart = now;
        flightEnd = now + Math.min(1000, Math.max(680, distance * 1.5));
      }
      if (now >= flightEnd - 80) {
        rest();
        bird.style.transform = destination;
        birdPositionRef.current = { x, y };
        return;
      }
      const direction =
        Math.abs(dx) > 8
          ? Math.sign(dx)
          : x > (bounds.left + bounds.right) / 2
            ? -1
            : 1;
      // Incluso entre ventanas con la misma geometría, un arco corto da vida al cambio.
      const hop = distance < 20;
      const bend = Math.min(54, Math.max(26, distance * 0.16));
      const controlX = clamp(
        (fromX + x) / 2 + (hop ? direction * 44 : (-Math.sign(dy) * bend) / 2),
        bounds.left,
        bounds.right,
      );
      const controlY = clamp(
        (fromY + y) / 2 +
          (Math.min(fromY, y) - bounds.top < bend ? bend : -bend),
        bounds.top,
        bounds.bottom,
      );
      const frames = [0, 0.2, 0.45, 0.72, 0.9, 1].map((offset) => {
        const inverse = 1 - offset;
        const px =
          inverse * inverse * fromX +
          2 * inverse * offset * controlX +
          offset * offset * x;
        const py =
          inverse * inverse * fromY +
          2 * inverse * offset * controlY +
          offset * offset * y;
        return { offset, transform: `translate3d(${px}px, ${py}px, 0)` };
      });
      const previousTilt = getComputedStyle(pose).transform;
      cancelFlight();
      bird.style.transform = destination;
      birdPositionRef.current = { x, y };
      bird.dataset.direction = direction < 0 ? "left" : "right";
      bird.dataset.flying = "true";
      bird.dataset.phase = "flight";
      flightDestination = { x, y };
      lastRetarget = now;
      const duration = flightEnd - now;
      const bank =
        direction *
        Math.max(-18, Math.min(18, (dy / Math.max(60, distance)) * 20));
      flight = bird.animate(frames, {
        duration,
        easing: "cubic-bezier(0.2, 0.65, 0.25, 1)",
        fill: "none",
      });
      tilt = pose.animate(
        [
          {
            transform: previousTilt === "none" ? "rotate(0deg)" : previousTilt,
            offset: 0,
          },
          { transform: `rotate(${bank - direction * 9}deg)`, offset: 0.25 },
          { transform: `rotate(${bank}deg)`, offset: 0.55 },
          { transform: `rotate(${direction * 5}deg)`, offset: 0.86 },
          { transform: "rotate(0deg)", offset: 1 },
        ],
        { duration, easing: "ease-in-out", fill: "none" },
      );
      flight.onfinish = () => {
        if (closed) return;
        cancelFlight();
        arrived = true;
        bird.dataset.flying = "false";
        bird.dataset.phase = "landing";
        // Un aterrizaje y un parpadeo, sin ciclos de movimiento en reposo.
        landingTimer = window.setTimeout(() => {
          bird.dataset.phase = "rest";
        }, 1800);
      };
    }

    const measure = () => {
      frame = 0;
      if (closed) return;
      const nextTarget = document.getElementById(targetId);
      if (nextTarget !== target) {
        if (target) resize.unobserve(target);
        target = nextTarget;
        if (target) resize.observe(target);
      }
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const panelWidth = Math.min(352, width - 24);
      panel.style.width = `${panelWidth}px`;
      const panelHeight = panel.getBoundingClientRect().height;
      const safeBottom =
        Number.parseFloat(
          getComputedStyle(panel).getPropertyValue("--guide-safe-bottom"),
        ) || 0;
      const navbarRect = navbar?.getBoundingClientRect();
      const navigationRect = navigation?.getBoundingClientRect();
      const contentTop = Math.max(
        top + 12,
        navbarRect && navbarRect.top <= top + 1
          ? navbarRect.bottom + 12
          : top + 12,
        navigationRect &&
          navigationRect.width > width * 0.75 &&
          navigationRect.top <= (navbarRect?.bottom ?? top) + 12
          ? navigationRect.bottom + 12
          : top + 12,
      );
      const rect = target?.getBoundingClientRect();
      const available = Boolean(rect && rect.width > 0 && rect.height > 0);
      const tallMobileTarget = Boolean(
        width < 640 &&
          rect &&
          rect.height > height - panelHeight - (contentTop - top) - 24,
      );
      setTargetVisible(available);
      highlight.style.opacity = available ? "1" : "0";
      if (available && target && rect && !scrolled) {
        scrolled = true;
        // Reservar espacio para el panel, sin cambiar estilos ni foco de la demo.
        const desiredTop = tallMobileTarget
          ? contentTop - top + 12
          : Math.max(
              contentTop - top + 12,
              Math.min(
                108,
                Math.max(
                  24,
                  (height - panelHeight - Math.min(rect.height, height / 2)) /
                    2,
                ),
              ),
            );
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top - top - desiredTop),
          behavior: reduced.matches ? "instant" : "smooth",
        });
        schedule();
      }
      const side =
        rect && rect.left + rect.width / 2 > left + width / 2
          ? "left"
          : "right";
      const panelX =
        width < 640 || side === "left"
          ? left + 12
          : left + width - panelWidth - 12;
      const bottomY = Math.max(
        top + 12,
        top + height - panelHeight - Math.max(12, safeBottom + 8),
      );
      const topY = Math.max(contentTop, top + Math.min(84, height / 5));
      const overlap = (y: number) =>
        rect
          ? Math.max(
              0,
              Math.min(rect.right, panelX + panelWidth) -
                Math.max(rect.left, panelX),
            ) *
            Math.max(
              0,
              Math.min(rect.bottom, y + panelHeight) - Math.max(rect.top, y),
            )
          : 0;
      // Una tarjeta alta puede intersectar ambos docks: en móvil proteger su cabecera.
      const panelY = tallMobileTarget
        ? bottomY
        : overlap(topY) < overlap(bottomY)
          ? topY
          : bottomY;
      panel.style.transform = `translate3d(${panelX}px, ${panelY}px, 0)`;
      panel.dataset.ready = "true";
      const birdX = Math.min(
        left + width - 82,
        Math.max(left + 10, rect ? rect.right - 60 : panelX),
      );
      let birdY = Math.min(
        top + height - 82,
        Math.max(contentTop, rect ? rect.top - 62 : panelY - 80),
      );
      let birdFits = birdY >= contentTop;
      if (
        birdX + 72 > panelX &&
        birdX < panelX + panelWidth &&
        birdY + 72 > panelY &&
        birdY < panelY + panelHeight
      ) {
        if (panelY - 80 >= contentTop) birdY = panelY - 80;
        else if (panelY + panelHeight + 80 <= top + height - 10)
          birdY = panelY + panelHeight + 8;
        else birdFits = false;
      }
      moveBird(
        birdX,
        birdY,
        {
          left: left + 10,
          right: left + width - 82,
          top: contentTop,
          bottom: top + height - 82,
        },
        available && birdFits,
      );
      bird.style.opacity = available && birdFits ? "1" : "0";
      if (rect) {
        highlight.style.transform = `translate3d(${rect.left - 4}px, ${rect.top - 4}px, 0)`;
        highlight.style.width = `${rect.width + 8}px`;
        highlight.style.height = `${rect.height + 8}px`;
      }
    };
    function schedule() {
      if (!frame && !closed && !document.hidden)
        frame = requestAnimationFrame(measure);
    }
    function visibilityChanged() {
      if (!motionAllowed()) rest();
      schedule();
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(panel);
    if (navbar) resize.observe(navbar);
    if (navigation) resize.observe(navigation);
    const mutation = new MutationObserver(schedule);
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    window.visualViewport?.addEventListener("resize", schedule, {
      passive: true,
    });
    window.visualViewport?.addEventListener("scroll", schedule, {
      passive: true,
    });
    reduced.addEventListener("change", visibilityChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    titleRef.current?.focus({ preventScroll: true });
    schedule();
    return () => {
      closed = true;
      cancelAnimationFrame(frame);
      cancelFlight(true);
      clearTimeout(landingTimer);
      bird.dataset.flying = "false";
      bird.dataset.phase = "rest";
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      reduced.removeEventListener("change", visibilityChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [active, targetId, stepId]);

  if (!step) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.start}
        onClick={start}
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
      >
        <span className={styles.startBird}>
          <Bird />
        </span>
        {triggerLabel}
        <Arrow />
      </button>
      {open
        ? createPortal(
            <div className={styles.layer}>
              <span
                ref={highlightRef}
                className={styles.highlight}
                aria-hidden="true"
              />
              <span ref={birdRef} className={styles.bird} aria-hidden="true">
                <span ref={poseRef} className={styles.pose}>
                  <span className={styles.facing}>
                    <Bird />
                  </span>
                </span>
              </span>
              <section
                ref={panelRef}
                id={`${id}-panel`}
                className={styles.panel}
                role="dialog"
                aria-modal="false"
                aria-labelledby={`${id}-title`}
                aria-describedby={collapsed ? undefined : `${id}-description`}
                onKeyDown={(event) => {
                  if (event.altKey || event.ctrlKey || event.metaKey) return;
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    selectStep(
                      currentIndex + (event.key === "ArrowLeft" ? -1 : 1),
                    );
                  }
                }}
              >
                <div className={styles.top}>
                  <span className={styles.step}>
                    {guideLabel} · {currentIndex + 1}/{steps.length}
                  </span>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label={collapsed ? "Mostrar guía" : "Minimizar guía"}
                    aria-expanded={!collapsed}
                    aria-controls={`${id}-content`}
                    onClick={() => setCollapsed((value) => !value)}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      width="18"
                      height="18"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d={collapsed ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"}
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Cerrar recorrido"
                    onClick={() => setOpen(false)}
                  >
                    <svg
                      viewBox="0 0 20 20"
                      width="18"
                      height="18"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        d="m5 5 10 10M15 5 5 15"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
                <h2
                  key={step.id}
                  ref={titleRef}
                  id={`${id}-title`}
                  className={collapsed ? styles.compactTitle : styles.title}
                  tabIndex={-1}
                >
                  {step.title}
                </h2>
                <div id={`${id}-content`} hidden={collapsed}>
                  <p id={`${id}-description`} className={styles.description}>
                    {step.description}
                  </p>
                  {!targetVisible ? (
                    <p className={styles.unavailable}>
                      Esta sección no está visible. Puedes seguir con el próximo
                      paso.
                    </p>
                  ) : null}
                  <div className={styles.navigation}>
                    <button
                      type="button"
                      className={styles.previous}
                      disabled={currentIndex === 0}
                      onClick={() => selectStep(currentIndex - 1)}
                    >
                      <Arrow previous /> Anterior
                    </button>
                    <button
                      type="button"
                      className={styles.next}
                      onClick={() =>
                        currentIndex === steps.length - 1
                          ? setOpen(false)
                          : selectStep(currentIndex + 1)
                      }
                    >
                      {currentIndex === steps.length - 1
                        ? "Terminar"
                        : "Siguiente"}
                      <Arrow />
                    </button>
                  </div>
                  <p className={styles.keyboard}>
                    Explora a tu ritmo. Puedes usar las flechas y Escape.
                  </p>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
