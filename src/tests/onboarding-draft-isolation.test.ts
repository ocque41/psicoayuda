import { inArray } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { accountOnboardingDrafts, user } from "@/db/schema";

const harness = vi.hoisted(() => ({
  actor: "draft-fictional-a",
  effects: [] as (() => undefined | (() => void))[],
  statuses: [] as unknown[],
  calls: [] as string[],
  hold: null as Promise<void> | null,
  entered: null as (() => void) | null,
}));
// Lifecycle controlled explicitly; browser QA also exercises real React.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: <T>(current: T) => ({ current }),
  useState: () => ["initial", (value: unknown) => harness.statuses.push(value)],
  useCallback: <T>(fn: T) => fn,
  useEffect: (effect: () => undefined | (() => void)) =>
    harness.effects.push(effect),
}));
vi.mock("@/lib/auth-server", () => ({
  getServerSession: async () =>
    harness.actor ? { user: { id: harness.actor } } : null,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/app/empezar/actions", async (original) => {
  const actions = await original<typeof import("@/app/empezar/actions")>();
  return {
    ...actions,
    saveOnboardingDraft: async (
      ...args: Parameters<typeof actions.saveOnboardingDraft>
    ) => {
      harness.calls.push(harness.actor);
      const result = await actions.saveOnboardingDraft(...args);
      const hold = harness.hold;
      harness.hold = null;
      harness.entered?.();
      harness.entered = null;
      if (hold) await hold;
      return result;
    },
  };
});

import { saveOnboardingDraft } from "@/app/empezar/actions";
import { useDraftSave } from "@/components/onboarding/use-draft-save";
import { ACCOUNT_SESSION_CHANGED_EVENT } from "@/lib/chat-session-end";
import { readOnboardingDraft } from "@/lib/onboarding/drafts";

const A = "draft-fictional-a",
  B = "draft-fictional-b";
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function clean() {
  await db
    .delete(accountOnboardingDrafts)
    .where(inArray(accountOnboardingDrafts.userId, [A, B]));
}

describe("cola de borrador ligada al dueño del onboarding", () => {
  beforeAll(async () => {
    await clean();
    await db.delete(user).where(inArray(user.id, [A, B]));
    await db
      .insert(user)
      .values(
        [A, B].map((id) => ({ id, name: id, email: `${id}@example.test` })),
      );
  });
  beforeEach(async () => {
    vi.stubGlobal("window", new EventTarget());
    await clean();
    harness.actor = A;
    harness.effects = [];
    harness.statuses = [];
    harness.calls = [];
    harness.hold = null;
    harness.entered = null;
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await clean();
    await db.delete(user).where(inArray(user.id, [A, B]));
  });

  it.each([
    "patient",
    "pro",
  ] as const)("%s: la segunda escritura encolada no sale después de desmontar y cambiar a B", async (role) => {
    const firstResponse = deferred(),
      firstEntered = deferred();
    harness.hold = firstResponse.promise;
    harness.entered = firstEntered.resolve;
    const hook = useDraftSave(
      role,
      { displayName: "Primera respuesta ficticia A" },
      A,
    );
    const cleanup = harness.effects.map((effect) => effect());
    const first = hook.flush();
    await firstEntered.promise; // acción real ya persistió A; respuesta retenida
    const second = hook.flush({ displayName: "Segunda respuesta ficticia A" });
    harness.actor = B;
    for (const stop of cleanup) stop?.();
    firstResponse.resolve();
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result?.ok === false)).toBe(true);
    expect(await readOnboardingDraft(A, role)).toEqual({
      displayName: "Primera respuesta ficticia A",
    });
    expect(await readOnboardingDraft(B, role)).toEqual({});
    expect(harness.calls).toEqual([A]);
    expect(harness.statuses).toEqual([]);
  });

  it.each([
    "resolve",
    "reject",
  ] as const)("la señal invalida la segunda escritura y una respuesta %s tardía, conservando el reintento", async (outcome) => {
    const response = deferred(),
      entered = deferred();
    harness.hold = response.promise;
    harness.entered = entered.resolve;
    const hook = useDraftSave("patient", { displayName: "A conservado" }, A);
    const cleanup = harness.effects.map((effect) => effect());
    const first = hook.flush();
    await entered.promise;
    const second = hook.flush({ displayName: "A todavía en cola" });
    harness.actor = B;
    window.dispatchEvent(new Event(ACCOUNT_SESSION_CHANGED_EVENT));
    if (outcome === "resolve") response.resolve();
    else response.reject(new Error("Respuesta ficticia interrumpida"));
    const results = await Promise.all([first, second]);
    expect(results.every((result) => result?.ok === false)).toBe(true);
    expect(harness.calls).toEqual([A]);
    expect(harness.statuses).toEqual([
      "Tu sesión cambió. Vuelve a abrir este recorrido para continuar.",
    ]);
    expect(await readOnboardingDraft(B, "patient")).toEqual({});
    harness.actor = A;
    expect(
      (await hook.flush({ displayName: "A conservado y reintentado" }))?.ok,
    ).toBe(true);
    expect(await readOnboardingDraft(A, "patient")).toEqual({
      displayName: "A conservado y reintentado",
    });
    for (const stop of cleanup) stop?.();
  });

  it("el servidor rechaza dueño A con sesión fresca B sin sobrescribir B", async () => {
    harness.actor = B;
    await saveOnboardingDraft("patient", { displayName: "B original" }, B);
    const result = await saveOnboardingDraft(
      "patient",
      { displayName: "A tardío" },
      A,
    );
    expect(result?.ok).toBe(false);
    expect(await readOnboardingDraft(B, "patient")).toEqual({
      displayName: "B original",
    });
  });

  it("sin dueño esperado ni sesión no guarda, incluso con IDs en el payload", async () => {
    expect(
      (
        await saveOnboardingDraft(
          "patient",
          { userId: A, displayName: "Sin dueño" },
          "",
        )
      )?.ok,
    ).toBe(false);
    expect(
      (
        await saveOnboardingDraft(
          "patient",
          { displayName: "Cliente antiguo" },
          undefined as unknown as string,
        )
      )?.ok,
    ).toBe(false);
    harness.actor = "";
    expect(
      (await saveOnboardingDraft("patient", { displayName: "Sin sesión" }, A))
        ?.ok,
    ).toBe(false);
    expect(await readOnboardingDraft(A, "patient")).toEqual({});
  });

  it("el mismo dueño guarda normalmente conservando el filtrado de datos", async () => {
    expect(
      (
        await saveOnboardingDraft(
          "pro",
          { fullName: "Nombre ficticio", licenseNumber: "NO_GUARDAR" },
          A,
        )
      )?.ok,
    ).toBe(true);
    expect(await readOnboardingDraft(A, "pro")).toEqual({
      fullName: "Nombre ficticio",
    });
  });
});
