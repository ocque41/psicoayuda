"use client";

import { useEffect } from "react";
import { trackConversion } from "@/components/click-tracker";

// Dispara UNA conversión al montar la página de éxito, con el UTM de entrada.
// `dedupeKey` evita contar de más si la persona recarga la página de gracias
// (el id de la solicitud). Sin clave, se registra en cada montaje.
export function ConversionBeacon({
  type,
  dedupeKey,
  removeSearchParam,
}: {
  type: string;
  dedupeKey?: string;
  removeSearchParam?: string;
}) {
  useEffect(() => {
    const key = dedupeKey ? `nido:conv:${type}:${dedupeKey}` : null;
    try {
      if (!key || !sessionStorage.getItem(key)) {
        trackConversion(type);
        if (key) sessionStorage.setItem(key, "1");
      }
    } catch {
      trackConversion(type);
    }

    // La URL especial de alta social es de un solo uso. La quitamos después de
    // medir para que recargar la página no vuelva a parecer otro registro.
    if (removeSearchParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete(removeSearchParam);
      window.history.replaceState(
        null,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [type, dedupeKey, removeSearchParam]);
  return null;
}
