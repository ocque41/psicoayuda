"use client";

import { useActionState, useEffect, useState } from "react";
import { updateProfessionalPaidServices } from "@/app/actions";
import {
  deleteSessionPackage,
  type PackageFormState,
  saveSessionPackage,
  startStripeOnboarding,
  toggleSessionPackage,
} from "@/app/actions-payments";

export type PaymentSettingsPackage = {
  id: string;
  title: string;
  description: string | null;
  sessionsCount: number;
  validityDays: number | null;
  priceCents: number;
  active: boolean;
};

export type PaymentSettingsProps = {
  offersPaidServices: boolean;
  paymentsConfigured: boolean;
  connectStatus: "none" | "incomplete" | "restricted" | "ready";
  countrySupported: boolean;
  countryLabel: string | null;
  packages: PaymentSettingsPackage[];
  notice: string;
  siteUrl: string;
};

const initialState: PackageFormState = { status: "idle" };

function formatEuros(cents: number): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} €`;
  }
}

function shareMessage(pkg: PaymentSettingsPackage, url: string): string {
  return `Hola, te comparto mi paquete "${pkg.title}" (${formatEuros(
    pkg.priceCents,
  )}). Puedes verlo y pagarlo aquí: ${url}`;
}

export function PaymentSettings(props: PaymentSettingsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    saveSessionPackage,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      setEditingId(null);
      setFormKey((key) => key + 1);
    }
  }, [state.status]);

  const editing = editingId
    ? (props.packages.find((pkg) => pkg.id === editingId) ?? null)
    : null;

  async function copyLink(pkg: PaymentSettingsPackage) {
    const url = `${props.siteUrl}/pagar/${pkg.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(pkg.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch {
      // Si el navegador bloquea el portapapeles, el enlace visible sirve igual.
    }
  }

  if (!props.paymentsConfigured) {
    return (
      <div className="card">
        <p style={{ margin: "0 0 8px" }}>
          <strong>Cobros todavía no disponibles.</strong>
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Estamos terminando de configurar los pagos. Cuando esté listo, podrás
          crear tus paquetes y compartir links de pago desde aquí. Te
          avisaremos.
        </p>
      </div>
    );
  }

  return (
    <div className="credential-settings">
      {props.notice ? (
        <p className="status-message" role="status">
          {props.notice}
        </p>
      ) : null}

      <div className="card">
        <p style={{ margin: "0 0 8px" }}>
          <strong>Servicios pagos (opcional).</strong> La ayuda por el terremoto
          sigue siendo <strong>gratis</strong>: esta sección es solo para que
          puedas cobrar, si quieres, por acompañamiento ajeno a la emergencia
          después de conversar con la persona.
        </p>
        <form action={updateProfessionalPaidServices}>
          <div className="checks" style={{ margin: "0 0 10px" }}>
            <label>
              <input
                type="checkbox"
                name="offersPaidServices"
                defaultChecked={props.offersPaidServices}
              />
              Ofrezco también servicios pagos por otros temas y quiero mostrar
              la etiqueta en mi ficha.
            </label>
          </div>
          <button type="submit" className="button secondary">
            Guardar
          </button>
        </form>
      </div>

      {props.offersPaidServices ? (
        <>
          {!props.countrySupported ? (
            <div className="card">
              <p style={{ margin: "0 0 8px" }}>
                <strong>Pagos no disponibles en tu país todavía.</strong>
              </p>
              <p className="muted" style={{ margin: 0 }}>
                Por ahora no podemos transferir pagos a{" "}
                {props.countryLabel ?? "tu país"}. Tu perfil y la ayuda gratuita
                siguen funcionando con normalidad; si quieres, escríbenos por la
                página de contacto para avisarte cuando se habilite.
              </p>
            </div>
          ) : props.connectStatus === "ready" ? (
            <p className="status-message" role="status">
              Cobros activos: tus pagos se depositarán automáticamente en tu
              cuenta. Nido retiene una comisión fija de 5 € por transacción;
              Stripe descuenta además su comisión de procesamiento.
            </p>
          ) : (
            <div className="card">
              <p style={{ margin: "0 0 8px" }}>
                <strong>
                  {props.connectStatus === "none"
                    ? "Conecta tu cuenta para cobrar."
                    : "Termina la verificación de tu cuenta."}
                </strong>
              </p>
              <p className="muted" style={{ margin: "0 0 12px" }}>
                Stripe verifica tu identidad y tus datos de cobro (es el mismo
                proceso que usan las tiendas en línea). Al terminar, vuelve a
                este panel: aquí verás el estado.
              </p>
              <form action={startStripeOnboarding}>
                <button type="submit" className="button human">
                  {props.connectStatus === "none"
                    ? "Conectar mis cobros con Stripe"
                    : "Continuar verificación"}
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginTop: 0 }}>
              {editing ? "Editar paquete" : "Nuevo paquete de sesiones"}
            </h3>
            <form key={formKey} action={formAction}>
              {editing ? (
                <input type="hidden" name="packageId" value={editing.id} />
              ) : null}
              <div className="field">
                <label htmlFor="pkg-title">Título</label>
                <input
                  id="pkg-title"
                  name="title"
                  type="text"
                  required
                  maxLength={80}
                  defaultValue={editing?.title ?? ""}
                  placeholder="Ej.: 4 sesiones de acompañamiento"
                />
              </div>
              <div className="field">
                <label htmlFor="pkg-description">Descripción (opcional)</label>
                <textarea
                  id="pkg-description"
                  name="description"
                  rows={3}
                  maxLength={400}
                  defaultValue={editing?.description ?? ""}
                  placeholder="Qué incluye, cómo trabajas, qué puede esperar la persona…"
                />
              </div>
              <div className="field">
                <label htmlFor="pkg-sessions">Número de sesiones</label>
                <input
                  id="pkg-sessions"
                  name="sessionsCount"
                  type="number"
                  min={1}
                  max={50}
                  required
                  defaultValue={editing?.sessionsCount ?? 4}
                />
              </div>
              <div className="field">
                <label htmlFor="pkg-validity">
                  Vigencia en días (opcional)
                </label>
                <input
                  id="pkg-validity"
                  name="validityDays"
                  type="number"
                  min={1}
                  max={365}
                  defaultValue={editing?.validityDays ?? ""}
                  placeholder="Ej.: 30"
                />
              </div>
              <div className="field">
                <label htmlFor="pkg-price">Precio en euros</label>
                <input
                  id="pkg-price"
                  name="priceCents"
                  type="text"
                  inputMode="decimal"
                  required
                  defaultValue={
                    editing ? (editing.priceCents / 100).toFixed(0) : ""
                  }
                  placeholder="Ej.: 25"
                />
                <p className="hint">
                  Mínimo 10 €, máximo 1000 €. Nido retiene 5 € fijos por
                  transacción.
                </p>
              </div>

              {state.status === "error" && state.message ? (
                <p className="form-error" role="alert">
                  {state.message}
                </p>
              ) : null}
              {state.status === "success" && state.message ? (
                <p className="status-message" role="status">
                  {state.message}
                </p>
              ) : null}

              <div className="conversation-delete-actions">
                <button
                  type="submit"
                  className="button human"
                  disabled={pending}
                  aria-busy={pending}
                >
                  {pending
                    ? "Guardando…"
                    : editing
                      ? "Guardar cambios"
                      : "Crear paquete"}
                </button>
                {editing ? (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setEditingId(null);
                      setFormKey((key) => key + 1);
                    }}
                  >
                    Cancelar edición
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Tus paquetes</h3>
            {props.packages.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>
                Aún no tienes paquetes. Crea el primero arriba y comparte su
                link cuando lo necesites.
              </p>
            ) : (
              <ul className="offer-list">
                {props.packages.map((pkg) => {
                  const url = `${props.siteUrl}/pagar/${pkg.id}`;
                  return (
                    <li key={pkg.id} className="card">
                      <p style={{ margin: "0 0 6px" }}>
                        <strong>{pkg.title}</strong> ·{" "}
                        {formatEuros(pkg.priceCents)}
                        {pkg.active ? "" : " · inactivo"}
                      </p>
                      <p className="muted" style={{ margin: "0 0 8px" }}>
                        {pkg.sessionsCount}{" "}
                        {pkg.sessionsCount === 1 ? "sesión" : "sesiones"}
                        {pkg.validityDays
                          ? ` · válidas por ${pkg.validityDays} días`
                          : ""}
                      </p>
                      <p className="hint" style={{ margin: "0 0 10px" }}>
                        <span style={{ wordBreak: "break-all" }}>{url}</span>
                      </p>
                      <div className="conversation-delete-actions">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => copyLink(pkg)}
                        >
                          {copiedId === pkg.id ? "Copiado" : "Copiar link"}
                        </button>
                        <a
                          className="button secondary"
                          href={`https://wa.me/?text=${encodeURIComponent(
                            shareMessage(pkg, url),
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Compartir por WhatsApp
                        </a>
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => {
                            setEditingId(pkg.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Editar
                        </button>
                        <form action={toggleSessionPackage}>
                          <input
                            type="hidden"
                            name="packageId"
                            value={pkg.id}
                          />
                          <input
                            type="hidden"
                            name="active"
                            value={pkg.active ? "" : "on"}
                          />
                          <button type="submit" className="button secondary">
                            {pkg.active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                        {confirmDeleteId === pkg.id ? (
                          <>
                            <form action={deleteSessionPackage}>
                              <input
                                type="hidden"
                                name="packageId"
                                value={pkg.id}
                              />
                              <button type="submit" className="button danger">
                                Sí, eliminar
                              </button>
                            </form>
                            <button
                              type="button"
                              className="button secondary"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="button secondary danger"
                            onClick={() => setConfirmDeleteId(pkg.id)}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
