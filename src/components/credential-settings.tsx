"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  type CredentialFormState,
  changeMyEmail,
  changeMyPassword,
  updateMyPhones,
} from "@/app/actions-credentials";
import { TurnstileWidget } from "@/components/turnstile-widget";

type CommonProps = {
  turnstileSiteKey: string | null;
};

/** Reacciona al resultado de la acción: limpia el widget (token de un uso). */
function useTurnstileReset(state: CredentialFormState) {
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    if (state) setResetKey((value) => value + 1);
  }, [state]);
  return resetKey;
}

function TurnstileSlot({
  siteKey,
  resetKey,
}: {
  siteKey: string | null;
  resetKey: number;
}) {
  if (!siteKey) return null;
  // La `key` remonta el widget tras cada intento: los tokens son de un solo uso.
  return <TurnstileWidget key={resetKey} siteKey={siteKey} />;
}

function ResultMessage({ state }: { state: CredentialFormState }) {
  if (!state) return null;
  if (state.status === "success") {
    return (
      <p className="status-message" role="status">
        {state.message}
      </p>
    );
  }
  return (
    <p className="form-error" role="alert">
      {state.message}
    </p>
  );
}

function EmailForm({
  currentEmail,
  emailVerified,
  hasPassword,
  turnstileSiteKey,
}: CommonProps & {
  currentEmail: string;
  emailVerified: boolean;
  hasPassword: boolean;
}) {
  const ids = useId();
  const initialState: CredentialFormState = null;
  const [state, action, pending] = useActionState(changeMyEmail, initialState);
  const resetKey = useTurnstileReset(state);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  return (
    <details className="disclosure">
      <summary>Cambiar mi correo</summary>
      <div className="disclosure-body">
        <p className="hint">
          Correo de tu cuenta: <strong>{currentEmail}</strong>.{" "}
          {emailVerified
            ? "Para protegerte, primero te pedimos aprobar el cambio desde tu correo actual y luego confirmar la dirección nueva."
            : "Te enviaremos un enlace de confirmación a la dirección nueva; hasta confirmarlo, tu correo actual sigue siendo el de tu cuenta."}
        </p>
        <form action={action}>
          <div className="field">
            <label htmlFor={`${ids}-email`}>Correo nuevo</label>
            <input
              id={`${ids}-email`}
              name="newEmail"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              placeholder="tucorreo@ejemplo.com"
            />
          </div>

          {hasPassword ? (
            <div className="field">
              <label htmlFor={`${ids}-password`}>
                Tu contraseña actual (para confirmar)
              </label>
              <div className="password-field">
                <input
                  id={`${ids}-password`}
                  name="currentPassword"
                  type={showPassword ? "text" : "password"}
                  required
                  maxLength={128}
                  autoComplete="current-password"
                  onKeyDown={(event) =>
                    setCapsLock(event.getModifierState("CapsLock"))
                  }
                  onKeyUp={(event) =>
                    setCapsLock(event.getModifierState("CapsLock"))
                  }
                  onBlur={() => setCapsLock(false)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {capsLock ? (
                <p className="caps-warning" role="status">
                  Ojo: tienes las mayúsculas activadas (Bloq Mayús).
                </p>
              ) : null}
            </div>
          ) : (
            <p className="hint">
              Tu cuenta entra con Google, así que no hay contraseña de Nido que
              confirmar: el cambio se protege aprobando la dirección actual y
              verificando la nueva.
            </p>
          )}

          <TurnstileSlot siteKey={turnstileSiteKey} resetKey={resetKey} />
          <ResultMessage state={state} />
          <button
            type="submit"
            className="button secondary"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? "Enviando…" : "Pedir cambio de correo"}
          </button>
        </form>
      </div>
    </details>
  );
}

function PasswordForm({
  hasPassword,
  turnstileSiteKey,
}: CommonProps & { hasPassword: boolean }) {
  const ids = useId();
  const initialState: CredentialFormState = null;
  const [state, action, pending] = useActionState(
    changeMyPassword,
    initialState,
  );
  const resetKey = useTurnstileReset(state);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  if (!hasPassword) {
    return (
      <details className="disclosure">
        <summary>Cambiar mi contraseña</summary>
        <div className="disclosure-body">
          <p className="hint">
            Tu cuenta entra con Google, así que no tiene contraseña propia de
            Nido. Puedes seguir entrando con Google como siempre.
          </p>
        </div>
      </details>
    );
  }

  return (
    <details className="disclosure">
      <summary>Cambiar mi contraseña</summary>
      <div className="disclosure-body">
        <p className="hint">
          Por seguridad te pedimos tu contraseña actual y, al guardar, cerramos
          las demás sesiones abiertas (tendrás que volver a entrar en los otros
          dispositivos con la contraseña nueva).
        </p>
        <form action={action}>
          <div className="field">
            <label htmlFor={`${ids}-current`}>Contraseña actual</label>
            <div className="password-field">
              <input
                id={`${ids}-current`}
                name="currentPassword"
                type={show ? "text" : "password"}
                required
                maxLength={128}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                onKeyDown={(event) =>
                  setCapsLock(event.getModifierState("CapsLock"))
                }
                onKeyUp={(event) =>
                  setCapsLock(event.getModifierState("CapsLock"))
                }
                onBlur={() => setCapsLock(false)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-pressed={show}
                onClick={() => setShow((value) => !value)}
              >
                {show ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor={`${ids}-next`}>Contraseña nueva</label>
            <input
              id={`${ids}-next`}
              name="newPassword"
              type={show ? "text" : "password"}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="hint">Al menos 8 caracteres.</p>
          </div>

          <div className="field">
            <label htmlFor={`${ids}-confirm`}>Repite la contraseña nueva</label>
            <input
              id={`${ids}-confirm`}
              name="confirmPassword"
              type={show ? "text" : "password"}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>

          {capsLock ? (
            <p className="caps-warning" role="status">
              Ojo: tienes las mayúsculas activadas (Bloq Mayús).
            </p>
          ) : null}

          <TurnstileSlot siteKey={turnstileSiteKey} resetKey={resetKey} />
          <ResultMessage state={state} />
          <button
            type="submit"
            className="button secondary"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? "Guardando…" : "Guardar contraseña nueva"}
          </button>
        </form>
      </div>
    </details>
  );
}

function PhoneForm({
  phone,
  landline,
  emailPublic,
  turnstileSiteKey,
}: CommonProps & {
  phone: string | null;
  landline: string | null;
  emailPublic: boolean;
}) {
  const ids = useId();
  const initialState: CredentialFormState = null;
  const [state, action, pending] = useActionState(updateMyPhones, initialState);
  const resetKey = useTurnstileReset(state);
  const [currentPhone, setCurrentPhone] = useState(phone ?? "");
  const [currentLandline, setCurrentLandline] = useState(landline ?? "");

  return (
    <details className="disclosure">
      <summary>Teléfonos de contacto (WhatsApp y fijo)</summary>
      <div className="disclosure-body">
        <p className="hint">
          Si los das, estos números se muestran <strong>públicos</strong> en tu
          ficha como botones de WhatsApp y llamada.{" "}
          {emailPublic
            ? "Puedes dejarlos vacíos: tu correo seguirá como contacto."
            : "Como no muestras tu correo, necesitamos al menos un teléfono."}
        </p>
        <form action={action}>
          <div className="field">
            <label htmlFor={`${ids}-phone`}>WhatsApp</label>
            <input
              id={`${ids}-phone`}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              required={!emailPublic && !currentLandline.trim()}
              value={currentPhone}
              onChange={(event) => setCurrentPhone(event.target.value)}
              placeholder="+58 412 1234567"
            />
          </div>
          <div className="field">
            <label htmlFor={`${ids}-landline`}>Teléfono fijo (opcional)</label>
            <input
              id={`${ids}-landline`}
              name="landline"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={40}
              required={!emailPublic && !currentPhone.trim()}
              value={currentLandline}
              onChange={(event) => setCurrentLandline(event.target.value)}
              placeholder="+58 212 1234567"
            />
          </div>

          <TurnstileSlot siteKey={turnstileSiteKey} resetKey={resetKey} />
          <ResultMessage state={state} />
          <button
            type="submit"
            className="button secondary"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? "Guardando…" : "Guardar teléfonos"}
          </button>
        </form>
      </div>
    </details>
  );
}

/**
 * Sección "Tu cuenta" del panel: cambiar correo, contraseña y teléfonos.
 * Cada cambio crítico va con contraseña cuando existe, verificación por correo,
 * auditoría en D1 y (si Cloudflare Turnstile está configurado) verificación
 * anti-abuso.
 */
export function CredentialSettings({
  currentEmail,
  emailVerified,
  hasPassword,
  phone,
  landline,
  emailPublic,
  turnstileSiteKey,
}: {
  currentEmail: string;
  emailVerified: boolean;
  hasPassword: boolean;
  phone: string | null;
  landline: string | null;
  emailPublic: boolean;
  turnstileSiteKey: string | null;
}) {
  return (
    <div className="credential-settings">
      <p className="hint">
        Aquí gestionas tus datos de acceso y contacto. Los cambios de correo y
        contraseña se confirman por correo; los avisos de seguridad llegan a tu
        dirección de la cuenta.
      </p>
      <EmailForm
        currentEmail={currentEmail}
        emailVerified={emailVerified}
        hasPassword={hasPassword}
        turnstileSiteKey={turnstileSiteKey}
      />
      <PasswordForm
        hasPassword={hasPassword}
        turnstileSiteKey={turnstileSiteKey}
      />
      <PhoneForm
        phone={phone}
        landline={landline}
        emailPublic={emailPublic}
        turnstileSiteKey={turnstileSiteKey}
      />
    </div>
  );
}
