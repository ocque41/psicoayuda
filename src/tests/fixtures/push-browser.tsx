import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PushPreferencesPanel } from "@/components/push/push-preferences-panel";
import type { PushPreferences } from "@/lib/push/contract";
import { pushDigest } from "@/lib/push/encoding";

const params = new URLSearchParams(location.search);
const role = params.get("role") === "patient" ? "patient" : "professional";
const publicKey =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const endpoint =
  "https://fcm.googleapis.com/fcm/send/fictitious-browser-fixture";
const fixture = {
  calls: [] as Array<{ method: string; body: unknown }>,
  permissionRequests: 0,
  subscribed: false,
  failNext: false,
};
Object.assign(window, { fixture });
const fakeSubscription = {
  endpoint,
  options: {},
  unsubscribe: async () => {
    fixture.subscribed = false;
    return true;
  },
  toJSON: () => ({
    endpoint,
    keys: { p256dh: publicKey, auth: "BTBZMqHH6r4Tts7J_aSIgg" },
  }),
};
const registration = {
  active: { scriptURL: new URL("/nido-push-sw.js", location.origin).href },
  pushManager: {
    getSubscription: async () => (fixture.subscribed ? fakeSubscription : null),
    subscribe: async () => {
      fixture.subscribed = true;
      return fakeSubscription;
    },
  },
};
Object.defineProperty(navigator, "serviceWorker", {
  configurable: true,
  value: {
    getRegistration: async () => registration,
    register: async () => registration,
    ready: Promise.resolve(registration),
  },
});
const notifications = {
  permission: params.has("denied") ? "denied" : "default",
  requestPermission: async () => {
    fixture.permissionRequests++;
    notifications.permission = params.has("dismiss") ? "default" : "granted";
    return notifications.permission;
  },
};
Object.defineProperty(window, "Notification", {
  configurable: true,
  value: notifications,
});
if (params.has("unsupported")) Reflect.deleteProperty(window, "PushManager");
if (params.has("ios"))
  Object.defineProperty(navigator, "userAgent", {
    value: "iPhone fixture",
    configurable: true,
  });
let devices: Array<{
  id: string;
  revision: number;
  active: boolean;
  endpointHash: string;
  preferences: PushPreferences;
}> = [];
window.fetch = async (input, init) => {
  if (String(input) !== `/api/push?role=${role}`)
    throw new Error("Fixture: red externa bloqueada");
  const method = init?.method || "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  fixture.calls.push({ method, body });
  if (fixture.failNext && method !== "GET") {
    fixture.failNext = false;
    return Response.json(
      { message: "Conflicto ficticio: tus elecciones siguen aquí." },
      { status: 409 },
    );
  }
  if (method === "POST")
    devices = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        revision: (devices[0]?.revision || 0) + 1,
        active: true,
        endpointHash: await pushDigest(endpoint),
        preferences: body.preferences,
      },
    ];
  if (method === "PATCH")
    devices = devices.map((device) => ({
      ...device,
      revision: device.revision + 1,
      preferences: body.preferences,
    }));
  if (method === "DELETE")
    devices = devices.map((device) => ({
      ...device,
      active: false,
      revision: device.revision + 1,
    }));
  return Response.json(
    method === "GET"
      ? { available: !params.has("unavailable"), publicKey, devices }
      : { ok: true },
  );
};
const container = document.getElementById("root");
if (!container) throw new Error("Falta contenedor ficticio");
createRoot(container).render(
  <StrictMode>
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
      <h1>
        Ajustes ficticios · {role === "patient" ? "Paciente" : "Profesional"}
      </h1>
      <PushPreferencesPanel role={role} />
    </main>
  </StrictMode>,
);
