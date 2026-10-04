"use client";

import { useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { WorkspaceIcon, type WorkspaceIconName } from "./icon";
import styles from "./settings-panel.module.css";

export type SettingsSection = {
  id: "cuenta" | "agenda" | "avisos" | "conexiones" | "privacidad";
  label: string;
  description: string;
  icon: WorkspaceIconName;
  content: ReactNode;
  anchors?: string[];
};

/** Mantiene montados los formularios al cambiar de apartado, sin perder borradores. */
export function SettingsPanel({
  sections,
  initialSection = "cuenta",
}: {
  sections: SettingsSection[];
  initialSection?: SettingsSection["id"];
}) {
  const params = useSearchParams();
  const id = useId();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [anchorSection, setAnchorSection] = useState<string | null>(null);
  const requested = params.get("ajuste");
  const selected =
    anchorSection ||
    sections.find((section) => section.id === requested)?.id ||
    initialSection;
  const active =
    sections.find((section) => section.id === selected) || sections[0];

  useEffect(() => {
    function readAnchor() {
      const anchor = window.location.hash.slice(1);
      setAnchorSection(
        sections.find((section) => section.anchors?.includes(anchor))?.id ||
          null,
      );
    }
    function revealGuideTarget(event: Event) {
      const target = (event as CustomEvent<unknown>).detail;
      if (typeof target !== "string") return;
      const section = sections.find((candidate) =>
        candidate.anchors?.includes(target),
      );
      if (!section) return;
      const url = new URL(window.location.href);
      url.searchParams.set("ajuste", section.id);
      url.hash = target;
      // La guía mide su destino después de esta selección, con el formulario visible.
      flushSync(() => {
        window.history.replaceState(
          null,
          "",
          `${url.pathname}${url.search}${url.hash}`,
        );
        setAnchorSection(section.id);
      });
    }
    readAnchor();
    window.addEventListener("hashchange", readAnchor);
    window.addEventListener("popstate", readAnchor);
    window.addEventListener("nido:settings-target", revealGuideTarget);
    return () => {
      window.removeEventListener("hashchange", readAnchor);
      window.removeEventListener("popstate", readAnchor);
      window.removeEventListener("nido:settings-target", revealGuideTarget);
    };
  }, [sections]);

  function select(section: SettingsSection["id"]) {
    // Cambiar de apartado termina la guía contextual que apuntaba al anterior.
    window.dispatchEvent(
      new CustomEvent("nido:guide-started", { detail: "settings-navigation" }),
    );
    const url = new URL(window.location.href);
    url.searchParams.set("ajuste", section);
    url.hash = "ajustes";
    if (url.href !== window.location.href)
      window.history.pushState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    setAnchorSection(null);
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = sections.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: (index + 1) % sections.length,
      ArrowRight: (index + 1) % sections.length,
      ArrowUp: (index + last) % sections.length,
      ArrowLeft: (index + last) % sections.length,
      Home: 0,
      End: last,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const target = sections[moves[event.key]];
    select(target.id);
    buttons.current.get(target.id)?.focus();
  }

  return (
    <div className={styles.panel} id="ajustes">
      <div className={styles.navigation}>
        <p className={styles.caption}>Tus ajustes</p>
        <div
          role="tablist"
          aria-label="Apartados de ajustes"
          aria-orientation="vertical"
          className={styles.tabs}
        >
          {sections.map((section, index) => (
            <button
              key={section.id}
              id={`${id}-tab-${section.id}`}
              type="button"
              role="tab"
              aria-selected={active.id === section.id}
              aria-controls={`${id}-panel-${section.id}`}
              tabIndex={active.id === section.id ? 0 : -1}
              ref={(node) => {
                if (node) buttons.current.set(section.id, node);
                else buttons.current.delete(section.id);
              }}
              onClick={() => select(section.id)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <WorkspaceIcon name={section.icon} />
              <span>{section.label}</span>
              <span className={styles.arrow} aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </div>
        <p className={styles.note}>
          Elige un apartado y guarda los cambios cuando estés listo.
        </p>
      </div>
      <div className={styles.content}>
        {sections.map((section) => (
          <section
            key={section.id}
            id={`${id}-panel-${section.id}`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${section.id}`}
            hidden={active.id !== section.id}
            className={styles.section}
          >
            <header className={styles.heading}>
              <h2>{section.label}</h2>
              <p>{section.description}</p>
            </header>
            <div className="workspace-stack">{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
