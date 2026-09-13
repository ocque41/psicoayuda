"use client";

import { useActionState } from "react";
import { type PayState, payForPackage } from "@/app/actions-payments";

const initialState: PayState = { status: "idle" };

export function PayButton({
  packageId,
  conversationId,
}: {
  packageId: string;
  conversationId: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    payForPackage,
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="packageId" value={packageId} />
      {conversationId ? (
        <input type="hidden" name="conversationId" value={conversationId} />
      ) : null}
      {state.status === "error" && state.message ? (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        className="button"
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? "Abriendo pago seguro…" : "Pagar con tarjeta"}
      </button>
      <p className="hint" style={{ marginTop: 10 }}>
        Serás llevado/a a la pasarela segura de Stripe. Nido nunca ve ni guarda
        los datos de tu tarjeta.
      </p>
    </form>
  );
}
