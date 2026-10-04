"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { PushPreferences, PushRole } from "@/lib/push/contract";
import { decodeBase64url, pushDigest } from "@/lib/push/encoding";
import { PushGuide } from "./push-guide";
import styles from "./push-preferences.module.css";

type Device = {
  id: string;
  revision: number;
  active: boolean;
  endpointHash: string;
  preferences: PushPreferences;
};
type State = {
  available: boolean;
  publicKey: string | null;
  devices: Device[];
};
const defaults: PushPreferences = {
  chatEnabled: false,
  appointmentEnabled: false,
  afterSessionEnabled: false,
  offsetMinutes: 60,
  timeZone: "America/Caracas",
  quietEnabled: true,
  quietStart: 1320,
  quietEnd: 480,
};
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const minute = (value: string) => {
  const [hour, min] = value.split(":").map(Number);
  return hour * 60 + min;
};
class PushUiError extends Error {}
const failureMessage = (error: unknown, fallback: string) =>
  error instanceof PushUiError ? error.message : fallback;
export function PushPreferencesPanel({ role }: { role: PushRole }) {
  const id = useId();
  const loadSequence = useRef(0);
  const [state, setState] = useState<State | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [preferences, setPreferences] = useState(defaults);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [iosInstall, setIosInstall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const endpoint = `/api/push?role=${role}`;
  const request = useCallback(
    async (method: string, body?: unknown) => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(endpoint, {
          method,
          cache: "no-store",
          credentials: "same-origin",
          headers: body ? { "Content-Type": "application/json" } : {},
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        const value = await response.json();
        if (!response.ok)
          throw new PushUiError(
            typeof value.message === "string"
              ? value.message
              : "No pudimos guardar los avisos.",
          );
        return value;
      } catch (error) {
        throw new PushUiError(
          failureMessage(
            error,
            "No pudimos conectar con Nido. Tus elecciones siguen aquí; vuelve a intentarlo.",
          ),
        );
      } finally {
        window.clearTimeout(timer);
      }
    },
    [endpoint],
  );
  const reload = useCallback(
    async (restore = true) => {
      const sequence = ++loadSequence.current;
      const value: State = await request("GET");
      let current: Device | null = null;
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const hash = await pushDigest(subscription.endpoint);
          current =
            value.devices.find((row) => row.endpointHash === hash) || null;
        }
      }
      if (sequence !== loadSequence.current) return;
      setState(value);
      setDevice(current);
      if (restore && current) setPreferences(current.preferences);
      if ("Notification" in window) setPermission(Notification.permission);
    },
    [request],
  );
  useEffect(() => {
    const usable =
      window.isSecureContext &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(usable);
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIosInstall(
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) &&
        !installed,
    );
    setPreferences((previous) => ({
      ...previous,
      timeZone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || previous.timeZone,
    }));
    let active = true;
    reload().catch((error) => {
      if (active)
        setMessage(
          failureMessage(
            error,
            "No pudimos consultar los avisos. Inténtalo de nuevo.",
          ),
        );
    });
    return () => {
      active = false;
      loadSequence.current++;
    };
  }, [reload]);
  function choose<K extends keyof PushPreferences>(
    key: K,
    value: PushPreferences[K],
  ) {
    setPreferences((previous) => ({ ...previous, [key]: value }));
  }
  async function activate() {
    if (!state?.publicKey || !supported || iosInstall) return;
    setBusy(true);
    setMessage("");
    try {
      // Called before the first asynchronous operation, directly from the click.
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted")
        throw new PushUiError(
          granted === "denied"
            ? "El navegador bloqueó los avisos. Puedes cambiar el permiso en los ajustes del dispositivo."
            : "No se activaron los avisos. Puedes volver a intentarlo cuando quieras.",
        );
      const existing = await navigator.serviceWorker.getRegistration("/");
      if (
        existing?.active &&
        new URL(existing.active.scriptURL).pathname !== "/nido-push-sw.js"
      )
        throw new PushUiError(
          "Este navegador necesita una revisión para activar los avisos. Prueba más adelante.",
        );
      const registration = await navigator.serviceWorker.register(
        "/nido-push-sw.js",
        { scope: "/", updateViaCache: "none" },
      );
      let timer = 0;
      try {
        await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_resolve, reject) => {
            timer = window.setTimeout(
              () =>
                reject(
                  new PushUiError(
                    "El navegador tardó demasiado en preparar los avisos. Vuelve a intentarlo.",
                  ),
                ),
              10000,
            );
          }),
        ]);
      } finally {
        window.clearTimeout(timer);
      }
      let subscription = await registration.pushManager.getSubscription();
      const key = decodeBase64url(state.publicKey, 65);
      if (subscription?.options.applicationServerKey) {
        const actual = new Uint8Array(
          subscription.options.applicationServerKey,
        );
        if (
          actual.length !== key.length ||
          actual.some((byte, index) => byte !== key[index])
        ) {
          await subscription.unsubscribe();
          subscription = null;
        }
      }
      let created = false;
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
        created = true;
      }
      try {
        const hash = await pushDigest(subscription.endpoint);
        const previous = state.devices.find((row) => row.endpointHash === hash);
        const json = subscription.toJSON();
        await request("POST", {
          subscription: { endpoint: json.endpoint, keys: json.keys },
          preferences,
          revision: previous?.revision || 0,
        });
      } catch (error) {
        if (created) await subscription.unsubscribe();
        throw error;
      }
      await reload();
      setMessage("Avisos activados en este dispositivo.");
    } catch (error) {
      setMessage(
        failureMessage(
          error,
          "No pudimos activar los avisos. Tus elecciones siguen aquí.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!device) return;
    setBusy(true);
    setMessage("");
    try {
      await request("PATCH", {
        id: device.id,
        revision: device.revision,
        preferences,
      });
      await reload();
      setMessage("Preferencias de aviso guardadas.");
    } catch (error) {
      setMessage(
        failureMessage(
          error,
          "No pudimos guardar. Tus elecciones siguen aquí.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function deactivate(all = false) {
    setBusy(true);
    setMessage("");
    try {
      await request("DELETE", all ? { all: true } : { id: device?.id });
      // Revoke on the server first: a failed browser unsubscribe cannot keep sending.
      let local = true;
      try {
        const registration =
          await navigator.serviceWorker?.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) local = await subscription.unsubscribe();
      } catch {
        local = false;
      }
      await reload();
      setMessage(
        local
          ? "Avisos desactivados en Nido."
          : "Avisos desactivados en Nido. Revisa también el permiso en los ajustes del navegador.",
      );
    } catch (error) {
      setMessage(
        failureMessage(
          error,
          "No pudimos desactivar los avisos. Inténtalo de nuevo.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const selected =
    preferences.chatEnabled ||
    preferences.appointmentEnabled ||
    (role === "professional" && preferences.afterSessionEnabled);
  return (
    <section id={id} className={styles.panel} aria-labelledby={`${id}-title`}>
      <div className={styles.heading}>
        <div>
          <h2 id={`${id}-title`}>Avisos con Nido cerrado</h2>
          <p>Elige qué quieres recibir en este dispositivo.</p>
        </div>
        <PushGuide targetId={id} />
      </div>
      <p>
        El correo se configura por separado. Cada persona decide sus propios
        avisos.
      </p>
      {!state ? (
        <p>Consulta tus avisos o vuelve a intentarlo.</p>
      ) : !state.available ? (
        <p>
          Estos avisos todavía no están disponibles. Podrás activarlos aquí
          cuando estén preparados.
        </p>
      ) : null}
      {!supported && (
        <p>
          Este navegador no permite estos avisos. Puedes seguir usando Nido y
          los recordatorios por correo.
        </p>
      )}
      {iosInstall && (
        <p>
          En iPhone o iPad, añade Nido a la pantalla de inicio desde Compartir y
          abre ese icono para activar los avisos.
        </p>
      )}
      {permission === "denied" && (
        <p>
          El navegador bloqueó el permiso. Revísalo en los ajustes del
          dispositivo.
        </p>
      )}
      <fieldset disabled={busy || !state} className={styles.options}>
        <legend>Qué me avisa</legend>
        <label>
          <input
            type="checkbox"
            checked={preferences.chatEnabled}
            onChange={(event) => choose("chatEnabled", event.target.checked)}
          />
          Mensajes nuevos
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.appointmentEnabled}
            onChange={(event) =>
              choose("appointmentEnabled", event.target.checked)
            }
          />
          Próximas sesiones
        </label>
        {role === "professional" && (
          <label>
            <input
              type="checkbox"
              checked={preferences.afterSessionEnabled}
              onChange={(event) =>
                choose("afterSessionEnabled", event.target.checked)
              }
            />
            Revisar notas después de una sesión
          </label>
        )}
        <label>
          Antes de la sesión
          <select
            value={preferences.offsetMinutes}
            onChange={(event) =>
              choose(
                "offsetMinutes",
                Number(event.target.value) as PushPreferences["offsetMinutes"],
              )
            }
          >
            {[15, 30, 60, 120, 1440].map((value) => (
              <option key={value} value={value}>
                {value < 60
                  ? `${value} minutos`
                  : value === 1440
                    ? "24 horas"
                    : `${value / 60} hora${value === 60 ? "" : "s"}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Zona horaria
          <input
            value={preferences.timeZone}
            maxLength={80}
            onChange={(event) => choose("timeZone", event.target.value)}
            placeholder="America/Caracas"
            autoComplete="off"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={preferences.quietEnabled}
            onChange={(event) => choose("quietEnabled", event.target.checked)}
          />
          Respetar mi horario de descanso
        </label>
        {preferences.quietEnabled && (
          <div className={styles.hours}>
            <label>
              Desde
              <input
                type="time"
                value={clock(preferences.quietStart)}
                onChange={(event) =>
                  choose("quietStart", minute(event.target.value))
                }
              />
            </label>
            <label>
              Hasta
              <input
                type="time"
                value={clock(preferences.quietEnd)}
                onChange={(event) =>
                  choose("quietEnd", minute(event.target.value))
                }
              />
            </label>
          </div>
        )}
      </fieldset>
      <div className={styles.actions}>
        {device?.active && permission === "granted" ? (
          <button type="button" disabled={busy} onClick={save}>
            Guardar preferencias
          </button>
        ) : (
          <button
            type="button"
            disabled={
              busy ||
              !state?.available ||
              !supported ||
              iosInstall ||
              !selected ||
              permission === "denied"
            }
            onClick={activate}
          >
            Activar en este dispositivo
          </button>
        )}
        {device && (
          <button type="button" disabled={busy} onClick={() => deactivate()}>
            Desactivar este dispositivo
          </button>
        )}
        {Boolean(state?.devices.length) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => deactivate(true)}
          >
            Desactivar todos mis dispositivos
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            reload(false).catch((error) =>
              setMessage(
                failureMessage(
                  error,
                  "No pudimos consultar los avisos. Inténtalo de nuevo.",
                ),
              ),
            )
          }
        >
          Actualizar estado
        </button>
      </div>
      <p role="status" aria-live="polite">
        {busy ? "Guardando tus avisos…" : message}
      </p>
    </section>
  );
}
