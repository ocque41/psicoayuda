"use client";

import { useActionState } from "react";
import { chooseAccountRole } from "@/app/empezar/actions";
import styles from "./onboarding.module.css";

export function RolePicker({ name }: { name: string }) {
  const [state, action, pending] = useActionState(
    async (
      previous: Parameters<typeof chooseAccountRole>[0],
      form: FormData,
    ) => {
      try {
        return await chooseAccountRole(previous, form);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "digest" in error &&
          String(error.digest).startsWith("NEXT_REDIRECT")
        )
          throw error;
        return {
          ok: false,
          message:
            "No pudimos abrir tu espacio. Revisa tu conexión e intenta de nuevo.",
        };
      }
    },
    null,
  );
  return (
    <div className={styles.scene}>
      <form action={action} className={styles.modal} aria-busy={pending}>
        <p className={styles.eyebrow}>Un espacio para ti</p>
        <h1 className={styles.title}>¿Cómo quieres usar Nido?</h1>
        <p className={styles.description}>
          Hola, {name}. Elige por dónde empezar. Después podrás cambiar de
          espacio desde tu cuenta.
        </p>
        <div className={styles.choices}>
          <button
            className={styles.choice}
            name="role"
            value="patient"
            type="submit"
            disabled={pending}
          >
            <span className={styles.icon} aria-hidden="true">
              ↗
            </span>
            <strong>Busco acompañamiento</strong>
            <span>
              Tu agenda, tus conversaciones y tus profesionales, juntos en un
              espacio privado.
            </span>
          </button>
          <button
            className={styles.choice}
            name="role"
            value="pro"
            type="submit"
            disabled={pending}
          >
            <span className={styles.icon} aria-hidden="true">
              ✦
            </span>
            <strong>Soy profesional</strong>
            <span>
              Organiza tu consulta y crea un perfil que revisará nuestro equipo.
            </span>
          </button>
        </div>
        {pending ? (
          <p role="status" className={styles.description}>
            Preparando tu recorrido…
          </p>
        ) : null}
        {state?.message ? (
          <p className="form-error" role="alert">
            {state.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
