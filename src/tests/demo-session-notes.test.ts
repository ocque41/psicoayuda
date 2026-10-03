import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], index: 0 }));
vi.mock("react", async () => ({
  ...(await vi.importActual<typeof import("react")>("react")),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots))
      hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      hooks.slots[index],
      (next: unknown) => {
        hooks.slots[index] =
          typeof next === "function" ? next(hooks.slots[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useEffect: () => {},
}));

import { PracticeDemo } from "@/components/demo/practice-demo";

type Props = {
  id?: string;
  value?: string;
  disabled?: boolean;
  children?: ReactNode;
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
};
function descendants(node: ReactNode): ReactElement<Props>[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement<Props>(child)
      ? [child, ...descendants(child.props.children)]
      : [],
  );
}
function text(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<Props>(child) ? text(child.props.children) : String(child),
    )
    .join(" ")
    .replace(/\s+/g, " ");
}
function notesView() {
  hooks.index = 0;
  const root = PracticeDemo({ initialMonth: "2026-10" });
  const section = descendants(root).find(
    (node) => node.props.id === "demo-notas",
  );
  if (!section) throw new Error("No hay ventana de notas");
  const controls = descendants(section);
  const selects = controls.filter((node) => node.type === "select");
  return {
    patient: selects[0],
    session: selects[1],
    textarea: controls.find((node) => node.type === "textarea"),
    form: controls.find((node) => node.type === "form"),
    content: text(section),
  };
}
describe("demo: borradores y varias notas por paciente y sesión", () => {
  beforeEach(() => {
    hooks.slots = [];
    hooks.index = 0;
  });
  it("conserva un borrador al cambiar de sesión y paciente y guarda solo en el encuentro elegido", () => {
    let view = notesView();
    expect(view.session.props.value).toBe("ejemplo-1");
    view.textarea?.props.onChange?.({
      target: { value: "Borrador ficticio de la primera sesión" },
    });
    view.session.props.onChange?.({ target: { value: "ejemplo-3" } });
    view = notesView();
    expect(view.textarea?.props.value).toBe("");
    view.textarea?.props.onChange?.({
      target: { value: "Apunte ficticio del segundo encuentro" },
    });
    view = notesView();
    view.form?.props.onSubmit?.({ preventDefault: vi.fn() });
    view = notesView();
    expect(view.content).toContain("Apunte ficticio del segundo encuentro");
    expect(view.textarea?.props.value).toBe("");
    view.textarea?.props.onChange?.({
      target: { value: "Otro apunte para el segundo encuentro" },
    });
    view = notesView();
    view.form?.props.onSubmit?.({ preventDefault: vi.fn() });
    expect(notesView().content).toContain("Nota de ejemplo 2");
    view.patient.props.onChange?.({ target: { value: "luis" } });
    view = notesView();
    expect(view.session.props.value).toBe("ejemplo-2");
    expect(view.textarea?.props.value).toBe("");
    expect(view.content).not.toContain("Apunte ficticio del segundo encuentro");
    view.patient.props.onChange?.({ target: { value: "ana" } });
    view = notesView();
    expect(view.session.props.value).toBe("ejemplo-3");
    expect(view.content).toContain("Apunte ficticio del segundo encuentro");
    view.session.props.onChange?.({ target: { value: "ejemplo-1" } });
    view = notesView();
    expect(view.textarea?.props.value).toBe(
      "Borrador ficticio de la primera sesión",
    );
    expect(view.content).not.toContain("Apunte ficticio del segundo encuentro");
  });
});
