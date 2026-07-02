"use client";

import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { repararRegistroHuerfano } from "@/app/actions-account";

const authClient = createAuthClient();
const CALLBACK_URL = "/pro/onboarding";

type Mode = "signin" | "signup";

function translateError(
  error: {
    code?: string;
    message?: string;
    status?: number;
    statusText?: string;
  } | null,
) {
  const code = error?.code ?? "";
  // Rate limit (429): Better Auth limita /sign-in a 3 intentos/10s. Sin este
  // caso, un pro que teclea mal la clave un par de veces caía al mensaje
  // genérico "revisa tus datos", que invita a reintentar y lo deja en bucle
  // bloqueado ("no me deja entrar"). El 429 no siempre trae `code`, así que
  // miramos también status/statusText.
  if (
    error?.status === 429 ||
    /TOO_MANY_REQUESTS|RATE_LIMIT/i.test(code) ||
    /too many|rate.?limit/i.test(error?.statusText ?? "")
  ) {
    return "Demasiados intentos seguidos. Espera unos 30 segundos y vuelve a intentar. Si no recuerdas tu clave, usa «¿Olvidaste tu contraseña?».";
  }
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

export function AuthPanel({
  callbackURL = CALLBACK_URL,
  defaultMode = "signin",
  googleEnabled = false,
}: {
  callbackURL?: string;
  defaultMode?: Mode;
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  // "reset" es una vista interna (¿olvidaste tu contraseña?): no entra por
  // defaultMode, que sigue siendo solo entrar/crear cuenta.
  const [mode, setMode] = useState<Mode | "reset">(defaultMode);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function withGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL,
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
    setInfo("");
    setPending(true);
    // El autocompletado (sobre todo el móvil) cuela espacios al final del
    // correo y el login falla por un carácter invisible: normaliza siempre.
    const correo = email.trim();
    try {
      if (mode === "reset") {
        // Respuesta neutra exista o no la cuenta: no confirmamos correos
        // registrados a terceros (el servidor tampoco lo hace).
        const res = await authClient.requestPasswordReset({
          email: correo,
          redirectTo: "/pro/restablecer",
        });
        setPending(false);
        if (res.error) {
          setError(
            "No pudimos enviar el enlace. Espera un minuto e intenta de nuevo.",
          );
          return;
        }
        setInfo(
          "Si ese correo tiene cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también el spam; caduca en 1 hora.",
        );
        return;
      }

      let result =
        mode === "signup"
          ? await authClient.signUp.email({
              email: correo,
              password,
              name: name.trim() || correo,
              callbackURL,
            })
          : await authClient.signIn.email({ email: correo, password });

      // Registro que quedó a medias (fila user sin credencial, p. ej. si el
      // worker murió al hashear la contraseña): se repara en el servidor y se
      // reintenta una vez, para que nadie quede atrapado entre "ya existe una
      // cuenta" y "contraseña incorrecta".
      if (
        mode === "signup" &&
        /USER_ALREADY_EXISTS|EXISTING/.test(result.error?.code ?? "")
      ) {
        const { reparado } = await repararRegistroHuerfano(correo);
        if (reparado) {
          result = await authClient.signUp.email({
            email: correo,
            password,
            name: name.trim() || correo,
            callbackURL,
          });
        }
      }

      // La misma trampa desde "Entrar": quien volvía con un registro huérfano
      // veía "Correo o contraseña incorrectos" para siempre (la reparación
      // solo corría en el alta). Si el correo era un huérfano puro, se limpia
      // y se le guía a crear la cuenta de nuevo; para cuentas reales con
      // credencial la reparación es un no-op y cae al error normal.
      if (
        mode === "signin" &&
        /INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|INVALID_CREDENTIALS/.test(
          result.error?.code ?? "",
        )
      ) {
        const { reparado } = await repararRegistroHuerfano(correo);
        if (reparado) {
          setMode("signup");
          setPending(false);
          setInfo(
            "Tu registro anterior quedó a medias y ya lo limpiamos. Crea tu cuenta de nuevo con este correo para continuar.",
          );
          return;
        }
      }

      if (result.error) {
        setError(translateError(result.error));
        setPending(false);
        return;
      }
      // Pide al navegador guardar/actualizar la contraseña. En Chrome/Android
      // (la mayoría aquí) el guardado solo es fiable con la Credential
      // Management API: el login va por fetch y la heurística del formulario
      // no siempre salta. En Safari bastan los autocomplete del formulario.
      try {
        const w = window as unknown as {
          PasswordCredential?: new (data: {
            id: string;
            password: string;
          }) => Credential;
        };
        if (w.PasswordCredential && navigator.credentials?.store) {
          await navigator.credentials.store(
            new w.PasswordCredential({ id: correo, password }),
          );
        }
      } catch {
        // best-effort: si el navegador lo bloquea, el login sigue igual
      }
      router.push(callbackURL);
      router.refresh();
    } catch {
      setError("Algo falló de nuestro lado. Intenta de nuevo en un momento.");
      setPending(false);
    }
  }

  const busy = pending || googleLoading;

  return (
    <div className="card auth-panel">
      {googleEnabled && mode !== "reset" ? (
        <>
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
        </>
      ) : null}

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
            name="email"
            type="email"
            required
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {mode !== "reset" && (
          <div className="field">
            <label htmlFor={`${ids}-password`}>Contraseña</label>
            <div className="password-field">
              <input
                id={`${ids}-password`}
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                onBlur={() => setCapsLock(false)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {capsLock && (
              <p className="caps-warning" role="status">
                Ojo: tienes las mayúsculas activadas (Bloq Mayús).
              </p>
            )}
            {mode === "signup" && (
              <p className="hint">Al menos 8 caracteres.</p>
            )}
          </div>
        )}

        {mode === "signin" && (
          <p className="auth-toggle">
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError("");
                setInfo("");
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </p>
        )}

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {info ? (
          <p className="status-message" role="status">
            {info}
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
              : mode === "reset"
                ? "Enviarme el enlace"
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
                setInfo("");
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
                setInfo("");
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
