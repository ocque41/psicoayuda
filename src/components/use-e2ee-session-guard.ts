"use client";

import { useEffect, useMemo } from "react";
import {
  createE2eeSessionGuard,
  type E2eeActorCheck,
  listenE2eeSessionInvalidation,
} from "@/lib/e2ee-session-guard";

export function useE2eeSessionGuard(
  checkActor: E2eeActorCheck,
  onInvalidated: () => void,
) {
  const guard = useMemo(
    () => createE2eeSessionGuard(checkActor, onInvalidated),
    [checkActor, onInvalidated],
  );
  useEffect(() => {
    guard.start();
    const stop = listenE2eeSessionInvalidation(guard.invalidate);
    const refresh = () => {
      if (document.visibilityState === "visible") void guard.authorize();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 30_000);
    return () => {
      stop();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
      guard.dispose();
    };
  }, [guard]);
  return guard;
}
