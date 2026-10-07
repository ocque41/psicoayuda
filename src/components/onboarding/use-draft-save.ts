"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type OnboardingResult,
  saveOnboardingDraft,
} from "@/app/empezar/actions";
import {
  ACCOUNT_SESSION_CHANGED_EVENT,
  onChatSessionEnd,
  SESSION_CHANGED_EVENT,
} from "@/lib/chat-session-end";
import type { OnboardingRole, SafeDraft } from "@/lib/onboarding/drafts";

export function useDraftSave(
  role: OnboardingRole,
  answers: SafeDraft,
  ownerId: string,
) {
  const [status, setStatus] = useState("Tu progreso se guarda en tu cuenta.");
  const current = useRef(answers);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<OnboardingResult>>(Promise.resolve(null));
  const scope = useRef<{ ownerId: string; role: OnboardingRole } | null>(null);
  const generation = useRef(0);
  current.current = answers;
  const flush = useCallback(
    (snapshot: SafeDraft = current.current) => {
      if (timer.current) clearTimeout(timer.current);
      const epoch = generation.current;
      const active = () =>
        scope.current?.ownerId === ownerId &&
        scope.current.role === role &&
        generation.current === epoch;
      const cancelled = {
        ok: false,
        message:
          "Este guardado ya no está activo. Vuelve a abrir el recorrido.",
      };
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          // La cancelación debe ocurrir antes de iniciar la segunda acción,
          // además de descartar respuestas tardías de la primera.
          if (!active()) return cancelled;
          try {
            const result = await saveOnboardingDraft(role, snapshot, ownerId);
            if (!active()) return cancelled;
            setStatus(result?.message || "Tu progreso se guardó.");
            return result;
          } catch {
            if (!active()) return cancelled;
            setStatus(
              "No pudimos guardar el progreso. Conserva esta ventana abierta.",
            );
            return { ok: false, message: "No pudimos guardar el progreso." };
          }
        });
      return queue.current;
    },
    [role, ownerId],
  );
  useEffect(() => {
    scope.current = { ownerId, role };
    generation.current += 1;
    const invalidate = () => {
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
      setStatus(
        "Tu sesión cambió. Vuelve a abrir este recorrido para continuar.",
      );
    };
    const stop = onChatSessionEnd(invalidate);
    window.addEventListener(ACCOUNT_SESSION_CHANGED_EVENT, invalidate);
    window.addEventListener(SESSION_CHANGED_EVENT, invalidate);
    return () => {
      scope.current = null;
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
      stop();
      window.removeEventListener(ACCOUNT_SESSION_CHANGED_EVENT, invalidate);
      window.removeEventListener(SESSION_CHANGED_EVENT, invalidate);
    };
  }, [role, ownerId]);
  useEffect(() => {
    current.current = answers;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("Guardando tu progreso…");
      void flush();
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [answers, flush]);
  return { status, flush };
}
