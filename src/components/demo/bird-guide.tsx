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
  onStepChange?: (step: BirdGuideStep, index: number) => void;
};

/** Ilustración vectorial original: salvia, verde y el pequeño acento dorado de Nido. */
function Bird({ flightKey }: { flightKey?: string }) {
  return (
    <span className={styles.birdArt} key={flightKey} aria-hidden="true">
      <svg viewBox="0 0 88 80" fill="none" focusable="false" aria-hidden="true">
        <path d="m27 47-17 8 9-18" fill="#c5ddc5" />
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
        <circle cx="66" cy="36" r="2.4" fill="#245f47" />
        <circle cx="65.4" cy="35.4" r="0.7" fill="#fff" />
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
export function BirdGuide({ steps, onStepChange }: BirdGuideProps) {
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
  const highlightRef = useRef<HTMLSpanElement>(null);
  const currentIndex = Math.min(index, Math.max(0, steps.length - 1));
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
    const bird = birdRef.current;
    const highlight = highlightRef.current;
    if (!panel || !bird || !highlight) return;
    const navbar = document.querySelector<HTMLElement>("header.topbar");
    bird.dataset.step = stepId;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let flightTimer = 0;
    let target: HTMLElement | null = null;
    let scrolled = false;
    let flightStarted = false;
    let closed = false;
    if (!bird.dataset.positioned) {
      const origin = triggerRef.current?.getBoundingClientRect();
      if (origin)
        bird.style.transform = `translate3d(${origin.left}px, ${origin.top}px, 0)`;
      bird.dataset.positioned = "true";
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
      const contentTop = Math.max(
        top + 12,
        navbarRect && navbarRect.top <= top + 1
          ? navbarRect.bottom + 12
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
      if (!flightStarted) {
        flightStarted = true;
        bird.dataset.flying = "true";
        flightTimer = window.setTimeout(() => {
          bird.dataset.flying = "false";
        }, 850);
      }
      bird.style.transform = `translate3d(${birdX}px, ${birdY}px, 0)`;
      bird.style.opacity = available && birdFits ? "1" : "0";
      if (rect) {
        highlight.style.transform = `translate3d(${rect.left - 4}px, ${rect.top - 4}px, 0)`;
        highlight.style.width = `${rect.width + 8}px`;
        highlight.style.height = `${rect.height + 8}px`;
      }
    };
    function schedule() {
      if (!frame && !closed) frame = requestAnimationFrame(measure);
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(panel);
    if (navbar) resize.observe(navbar);
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
    reduced.addEventListener("change", schedule);
    titleRef.current?.focus({ preventScroll: true });
    schedule();
    return () => {
      closed = true;
      cancelAnimationFrame(frame);
      clearTimeout(flightTimer);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      reduced.removeEventListener("change", schedule);
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
        Conocer mi consulta
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
                <Bird flightKey={step.id} />
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
                    Tu consulta · {currentIndex + 1}/{steps.length}
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
