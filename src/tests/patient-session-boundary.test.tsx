import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PatientSessionBoundary } from "@/components/patient/session-boundary";
import {
  createPatientSessionBoundary,
  type PatientSession,
  type PatientSessionState,
  readCurrentPatientSession,
} from "@/lib/patient/session-boundary";

function valid(userId = "fictional-patient-a"): PatientSession {
  return { userId, expiresAt: Date.now() + 60_000 };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("contenido del paciente ligado a la sesión actual", () => {
  it("SSR no muestra datos antes de comprobar al dueño en el navegador", () => {
    const html = renderToStaticMarkup(
      <PatientSessionBoundary ownerId="fictional-patient-a">
        <p>Datos ficticios privados de A</p>
      </PatientSessionBoundary>,
    );
    expect(html).toContain("Comprobando tu sesión");
    expect(html).not.toContain("Datos ficticios privados de A");
    expect(html).not.toContain("fictional-patient-a");
  });

  it("autoriza sólo al dueño y bloquea la cuenta distinta o la sesión ausente", async () => {
    for (const session of [
      valid(),
      valid("fictional-patient-b"),
      { userId: null },
    ]) {
      const states: PatientSessionState[] = [];
      const guard = createPatientSessionBoundary(
        "fictional-patient-a",
        async () => session,
        (state) => states.push(state),
      );
      await guard.check();
      expect(states.at(-1)?.status).toBe(
        session.userId === "fictional-patient-a" ? "authorized" : "revoked",
      );
      guard.dispose();
    }
  });

  it("retira la vista inmediatamente al cerrar y descarta una respuesta positiva tardía", async () => {
    const pending = deferred<PatientSession>();
    const read = vi.fn((_signal: AbortSignal) => pending.promise);
    const changed = vi.fn();
    const guard = createPatientSessionBoundary(
      "fictional-patient-a",
      read,
      changed,
    );
    const check = guard.check();
    guard.end();
    expect(changed).toHaveBeenLastCalledWith({ status: "revoked" });
    expect(read.mock.calls[0]?.[0].aborted).toBe(true);
    pending.resolve(valid());
    await check;
    expect(changed).not.toHaveBeenCalledWith({ status: "authorized" });
    guard.dispose();
  });

  it("volver a entrar como A o B no restaura el RSC capturado antes del cierre", async () => {
    const read = vi.fn(async () => valid());
    const changed = vi.fn();
    const guard = createPatientSessionBoundary(
      "fictional-patient-a",
      read,
      changed,
    );
    await guard.check();
    guard.end();
    changed.mockClear();
    await guard.check();
    read.mockResolvedValue(valid("fictional-patient-b"));
    await guard.check();
    expect(changed).not.toHaveBeenCalledWith({ status: "authorized" });
    expect(changed).toHaveBeenLastCalledWith({
      status: "revoked",
      accountPresent: true,
    });
    guard.dispose();
  });

  it("un fallo transitorio permite reintentar al mismo dueño, sin borrado ni revocación falsa", async () => {
    const read = vi.fn(async () => valid());
    const changed = vi.fn();
    const guard = createPatientSessionBoundary(
      "fictional-patient-a",
      read,
      changed,
    );
    await guard.check();
    read.mockRejectedValueOnce(new Error("offline"));
    await guard.check();
    expect(changed).toHaveBeenLastCalledWith({ status: "unavailable" });
    await guard.check();
    expect(changed).toHaveBeenLastCalledWith({ status: "authorized" });
    guard.dispose();
  });

  it("un resultado de otra época no reemplaza una comprobación nueva", async () => {
    const pending = deferred<PatientSession>();
    const read = vi
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(valid());
    const changed = vi.fn();
    const guard = createPatientSessionBoundary(
      "fictional-patient-a",
      read,
      changed,
    );
    const old = guard.check();
    await guard.check();
    pending.resolve({ userId: null });
    await old;
    expect(changed).toHaveBeenLastCalledWith({ status: "authorized" });
    guard.dispose();
  });

  it("caducidad, pausa y desmontaje descartan respuestas y limpian timers", async () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const guard = createPatientSessionBoundary(
      "fictional-patient-a",
      async () => valid(),
      changed,
    );
    await guard.check();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(changed).toHaveBeenLastCalledWith({ status: "revoked" });
    guard.dispose();
    const pending = deferred<PatientSession>();
    const paused = createPatientSessionBoundary(
      "fictional-patient-a",
      () => pending.promise,
      changed,
    );
    const checking = paused.check();
    paused.pause();
    paused.dispose();
    changed.mockClear();
    pending.resolve(valid());
    await checking;
    expect(changed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("lee sesión propia sin caché; rechaza respuestas HTTP o esquemas incompletos", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          userId: "fictional-patient-a",
          expiresAt: Date.now() + 60_000,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const signal = new AbortController().signal;
    expect((await readCurrentPatientSession(signal)).userId).toBe(
      "fictional-patient-a",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/patient/session",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
        signal,
      }),
    );
    fetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    await expect(readCurrentPatientSession(signal)).rejects.toThrow();
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ user: { id: "fictional-patient-a" } })),
    );
    await expect(readCurrentPatientSession(signal)).rejects.toThrow();
    fetch.mockResolvedValueOnce(new Response("null"));
    expect(await readCurrentPatientSession(signal)).toEqual({ userId: null });
  });
});
