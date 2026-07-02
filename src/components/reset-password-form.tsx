"use client";

import { createAuthClient } from "better-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

const authClient = createAuthClient();

/**
 * Formulario de "crear contraseña nueva". Se llega desde el enlace del correo
 * de restablecimiento: Better Auth valida el token en /reset-password/<token>
 * y redirige aquí con ?token=… (o con ?error=INVALID_TOKEN si caducó).
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const ids = useId();
  const token = params.get("token") ?? "";
  const linkError = params.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  // Un solo interruptor para ambos campos: si muestras una, muestras las dos.
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  if (linkError || !token) {
    return (
      <p className="form-error" role="alert">
        El enlace caducó o ya se usó. Vuelve a <a href="/pro">iniciar sesión</a>{" "}
        y pide uno nuevo desde &quot;¿Olvidaste tu contraseña?&quot;.
      </p>
    );
  }

  if (done) {
    return (
      <p className="status-message" role="status">
        Contraseña actualizada. Ya puedes entrar con ella — te llevamos al
        inicio de sesión…
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setPending(true);
    try {
      const res = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (res.error) {
        setError(
          "El enlace caducó o ya se usó. Vuelve a iniciar sesión y pide uno nuevo desde “¿Olvidaste tu contraseña?”.",
        );
        setPending(false);
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/pro"), 2500);
    } catch {
      setError("Algo falló de nuestro lado. Intenta de nuevo en un momento.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor={`${ids}-password`}>Contraseña nueva</label>
        <div className="password-field">
          <input
            id={`${ids}-password`}
            name="password"
            type={show ? "text" : "password"}
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            onBlur={() => setCapsLock(false)}
          />
          <button
            type="button"
            className="password-toggle"
            aria-pressed={show}
            onClick={() => setShow((v) => !v)}
          >
            {show ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {capsLock && (
          <p className="caps-warning" role="status">
            Ojo: tienes las mayúsculas activadas (Bloq Mayús).
          </p>
        )}
        <p className="hint">Al menos 8 caracteres.</p>
      </div>

      <div className="field">
        <label htmlFor={`${ids}-confirm`}>Repite la contraseña</label>
        <input
          id={`${ids}-confirm`}
          name="confirm"
          type={show ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="button human block"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Un momento…" : "Guardar contraseña nueva"}
      </button>
    </form>
  );
}
