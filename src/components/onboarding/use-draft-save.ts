"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveOnboardingDraft } from "@/app/empezar/actions";
import type { OnboardingRole, SafeDraft } from "@/lib/onboarding/drafts";

export function useDraftSave(role: OnboardingRole, answers: SafeDraft) {
  const [status, setStatus] = useState("Tu progreso se guarda en tu cuenta.");
  const current = useRef(answers);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const mounted = useRef(true);
  current.current = answers;
  const flush = useCallback(
    (snapshot: SafeDraft = current.current) => {
      if (timer.current) clearTimeout(timer.current);
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          try {
            const result = await saveOnboardingDraft(role, snapshot);
            if (mounted.current)
              setStatus(result?.message || "Tu progreso se guardó.");
            return result;
          } catch {
            if (mounted.current)
              setStatus(
                "No pudimos guardar el progreso. Conserva esta ventana abierta.",
              );
            return { ok: false, message: "No pudimos guardar el progreso." };
          }
        });
      return queue.current;
    },
    [role],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
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
