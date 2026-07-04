"use client";

import { useEffect } from "react";
import { trackConversion } from "@/components/click-tracker";

// Dispara UNA conversión al montar la página de éxito, con el UTM de entrada.
// `dedupeKey` evita contar de más si la persona recarga la página de gracias
// (el id de la solicitud). Sin clave, se registra en cada montaje.
export function ConversionBeacon({
  type,
  dedupeKey,
}: {
  type: string;
  dedupeKey?: string;
}) {
  useEffect(() => {
    const key = dedupeKey ? `nido:conv:${type}:${dedupeKey}` : null;
    try {
      if (key && sessionStorage.getItem(key)) return;
      trackConversion(type);
      if (key) sessionStorage.setItem(key, "1");
    } catch {
      trackConversion(type);
    }
  }, [type, dedupeKey]);
  return null;
}
