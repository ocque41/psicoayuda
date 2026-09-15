"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef } from "react";
import type { SenderRole } from "@/shared/chat-protocol";
import { joinWaitlistFromChat } from "./actions";
import styles from "./chat.module.css";

/**
 * Tarjeta-mensaje de la lista de espera. El profesional la envía con un botón y
 * la persona deja su correo en el propio hilo (Enter o la flecha). Para el
 * profesional (o si ya se anotó) se muestra como estado, no como formulario.
 */
export function WaitlistPromptCard({
  conversationId,
  role,
  asPersona,
  signup,
  onJoined,
}: {
  conversationId: string;
  role: SenderRole;
  // El profesional puede estar viendo la sala como la persona: el envío debe
  // actuar con esa identidad (la misma prelación que la vista y el WebSocket).
  asPersona: boolean;
  signup: { email: string; createdAt: string } | null;
  onJoined: (email: string) => void;
}) {
  const [state, formAction, pending] = useActionState(
    joinWaitlistFromChat,
    null,
  );
  const inputId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const joinedRef = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (state && !state.ok) errorRef.current?.focus();
  }, [state]);

  // Al anotarse, la tarjeta pasa a "listo" y la página se refresca para que el
  // servidor traiga el estado nuevo (también visible al recargar el profesional).
  useEffect(() => {
    if (state?.ok && !joinedRef.current) {
      joinedRef.current = true;
      onJoined(state.email);
      router.refresh();
    }
  }, [state, onJoined, router]);

  return (
    <div className={styles.waitlistCard}>
      <p className={styles.waitlistTitle}>Lista de espera de Nido</p>

      {signup ? (
        <div className={styles.waitlistDone} role="status">
          <p className={styles.waitlistDoneLine}>
            <strong>Anotado:</strong> {signup.email}
          </p>
          <p className={styles.waitlistHint}>
            {role === "seeker"
              ? "Te escribiremos cuando haya disponibilidad para acompañarte. También puedes seguir la conversación por los medios que acordaron."
              : "La persona quedó en la lista de espera: el equipo la contactará cuando haya disponibilidad. Pueden seguir hablando por aquí o por los medios que acordaron."}
          </p>
        </div>
      ) : role === "seeker" ? (
        <form
          action={formAction}
          className={styles.waitlistForm}
          aria-busy={pending}
        >
          <input type="hidden" name="conversationId" value={conversationId} />
          <input type="hidden" name="asPersona" value={asPersona ? "1" : ""} />
          <p className={styles.waitlistText}>
            Si tu caso no es por el terremoto, deja tu correo y te avisamos
            cuando haya disponibilidad para acompañarte.
          </p>
          <label className={styles.waitlistLabel} htmlFor={inputId}>
            Tu correo electrónico
          </label>
          <div className={styles.waitlistRow}>
            <input
              id={inputId}
              className={styles.waitlistInput}
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoComplete="email"
              maxLength={200}
              required
              placeholder="nombre@correo.com"
            />
            <button
              type="submit"
              className={styles.waitlistSubmit}
              disabled={pending}
              aria-label="Anotarme en la lista de espera"
            >
              {pending ? "Enviando…" : "Anotarme"}
            </button>
          </div>
          {state && !state.ok ? (
            <p
              className={styles.waitlistError}
              role="alert"
              tabIndex={-1}
              ref={errorRef}
            >
              {state.message}
            </p>
          ) : null}
          <p className={styles.waitlistHint}>
            Usaremos tu correo solo para avisarte. No lo compartimos con nadie
            más.
          </p>
        </form>
      ) : (
        <p className={styles.waitlistHint}>
          Esperando a que la persona deje su correo para anotarla…
        </p>
      )}
    </div>
  );
}
