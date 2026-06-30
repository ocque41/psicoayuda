"use client";

import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";

const authClient = createAuthClient();
const CALLBACK_URL = "/pro/onboarding";

type Mode = "signin" | "signup";

function translateError(error: { code?: string; message?: string } | null) {
  const code = error?.code ?? "";
  if (
    /INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|INVALID_CREDENTIALS/.test(code)
  ) {
    return "Correo o contraseña incorrectos.";
  }
  if (/USER_ALREADY_EXISTS|EXISTING/.test(code)) {
    return "Ya existe una cuenta con ese correo. Entra en su lugar.";
  }
  if (/PASSWORD_TOO_SHORT|WEAK_PASSWORD/.test(code)) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  if (/INVALID_EMAIL/.test(code)) {
    return "Escribe un correo válido.";
  }
  return "Algo falló. Revisa tus datos e intenta de nuevo.";
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

export function AuthPanel({ defaultMode = "signin" }: { defaultMode?: Mode }) {
  const router = useRouter();
  const ids = useId();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function withGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: CALLBACK_URL,
      });
      // En éxito redirige a Google; si volvemos aquí con error (p. ej. proveedor
      // no configurado), lo mostramos en vez de dejar "Conectando…" colgado.
      setGoogleLoading(false);
      if (res?.error) {
        setError(
          "No pudimos conectar con Google. Intenta de nuevo o entra con tu correo.",
        );
      }
    } catch {
      setGoogleLoading(false);
      setError("No pudimos conectar con Google. Intenta de nuevo.");
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result =
        mode === "signup"
          ? await authClient.signUp.email({
              email,
              password,
              name: name.trim() || email,
              callbackURL: CALLBACK_URL,
            })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(translateError(result.error));
        setPending(false);
        return;
      }
      router.push(CALLBACK_URL);
      router.refresh();
    } catch {
      setError("Algo falló de nuestro lado. Intenta de nuevo en un momento.");
      setPending(false);
    }
  }

  const busy = pending || googleLoading;

  return (
    <div className="card auth-panel">
      <button
        type="button"
        className="button secondary block"
        onClick={withGoogle}
        disabled={busy}
        aria-busy={googleLoading}
      >
        {!googleLoading && <GoogleMark />}
        {googleLoading ? "Conectando con Google…" : "Continuar con Google"}
      </button>

      <div className="auth-divider">o con tu correo</div>

      <form onSubmit={onSubmit}>
        {mode === "signup" && (
          <div className="field">
            <label htmlFor={`${ids}-name`}>Tu nombre</label>
            <input
              id={`${ids}-name`}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor={`${ids}-email`}>Correo</label>
          <input
            id={`${ids}-email`}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${ids}-password`}>Contraseña</label>
          <input
            id={`${ids}-password`}
            type="password"
            required
            minLength={8}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && <p className="hint">Al menos 8 caracteres.</p>}
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="button human block"
          disabled={busy}
          aria-busy={pending}
        >
          {pending
            ? "Un momento…"
            : mode === "signup"
              ? "Crear mi cuenta"
              : "Entrar"}
        </button>
      </form>

      <p className="auth-toggle">
        {mode === "signin" ? (
          <>
            ¿Aún no tienes cuenta?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
              }}
            >
              Crea una
            </button>
          </>
        ) : (
          <>
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
              }}
            >
              Entra
            </button>
          </>
        )}
      </p>
    </div>
  );
}
