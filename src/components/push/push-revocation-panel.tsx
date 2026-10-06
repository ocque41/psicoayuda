"use client";
import { useEffect, useId, useState } from "react";
import { BirdGuide } from "@/components/demo/bird-guide";
import { type PushRole, pushRevocationStateSchema } from "@/lib/push/contract";
import styles from "./push-preferences.module.css";

type Device = { id: string; revokedAt: number | null };
async function request(
  audience: PushRole,
  method: "GET" | "DELETE",
  deviceId?: string,
) {
  const response = await fetch(`/api/push?role=${audience}&manage=revoke`, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    signal: AbortSignal.timeout(10000),
    headers: method === "DELETE" ? { "Content-Type": "application/json" } : {},
    body:
      method === "DELETE"
        ? JSON.stringify(deviceId ? { id: deviceId } : { all: true })
        : undefined,
  });
  if (!response.ok)
    throw new Error(
      "No pudimos consultar o retirar tus avisos. Vuelve a intentarlo.",
    );
  return response.json();
}
export function PushRevocationPanel({ audience }: { audience: PushRole }) {
  const id = useId();
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    request(audience, "GET")
      .then((value) => {
        if (active) setDevices(pushRevocationStateSchema.parse(value).devices);
      })
      .catch(() => {
        if (active)
          setMessage("No pudimos consultar tus avisos. Vuelve a intentarlo.");
      });
    return () => {
      active = false;
    };
  }, [audience]);
  async function revoke(deviceId?: string) {
    setBusy(true);
    try {
      await request(audience, "DELETE", deviceId);
      // A successful server revocation remains effective if refreshing fails.
      setDevices((rows) =>
        rows.map((row) =>
          !deviceId || row.id === deviceId
            ? { ...row, revokedAt: Date.now() }
            : row,
        ),
      );
      setMessage(
        "Avisos retirados en Nido. También puedes retirar el permiso en los ajustes del navegador.",
      );
    } catch {
      setMessage("No pudimos retirar tus avisos. Vuelve a intentarlo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id={id} className={styles.panel} aria-labelledby={`${id}-title`}>
      <div className={styles.heading}>
        <h2 id={`${id}-title`}>Retirar mis avisos</h2>
        <BirdGuide
          triggerLabel="El pájaro me explica la baja"
          guideLabel="Retirar mis avisos"
          steps={[
            {
              id: "baja",
              targetId: id,
              title: "Puedes retirar tus avisos",
              description:
                "Aunque tu perfil no esté aprobado o esté suspendido, puedes retirar los avisos de este espacio. Cada botón detiene un dispositivo propio; el botón de todos los dispositivos retira todos los de este espacio. No modifica otra cuenta ni los recordatorios por correo.",
            },
            {
              id: "permiso",
              targetId: id,
              title: "El permiso del navegador",
              description:
                "La baja detiene nuevos envíos desde Nido. Un aviso que ya salió no se puede retirar. Para quitar también el permiso local, usa los ajustes del navegador. Esta página no solicita permiso ni permite activar avisos nuevos.",
            },
          ]}
        />
      </div>
      <p>Puedes darte de baja aunque tu perfil no esté disponible.</p>
      <div className={styles.actions}>
        {devices
          .filter((device) => device.revokedAt === null)
          .map((device, index) => (
            <button
              key={device.id}
              type="button"
              disabled={busy}
              onClick={() => revoke(device.id)}
            >
              Retirar dispositivo {index + 1}
            </button>
          ))}
        <button type="button" disabled={busy} onClick={() => revoke()}>
          Retirar todos mis avisos de este espacio
        </button>
      </div>
      <p role="status" aria-live="polite">
        {busy ? "Retirando tus avisos…" : message}
      </p>
    </section>
  );
}
