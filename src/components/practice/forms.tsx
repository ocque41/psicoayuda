"use client";
import { type ReactNode, useActionState, useCallback } from "react";
import type { PracticeFormState } from "@/app/pro/consulta/actions";
import { TIME_ZONES } from "@/lib/geography";
export function PracticeForm({
  action,
  children,
  submit = "Guardar",
}: {
  action: (
    state: PracticeFormState,
    data: FormData,
  ) => Promise<PracticeFormState>;
  children?: ReactNode;
  submit?: string;
}) {
  const safeAction = useCallback(
    async (
      previous: PracticeFormState,
      data: FormData,
    ): Promise<PracticeFormState> => {
      try {
        return await action(previous, data);
      } catch (error) {
        const digest =
          error && typeof error === "object" && "digest" in error
            ? String(error.digest)
            : "";
        if (
          digest.startsWith("NEXT_REDIRECT") ||
          digest.startsWith("NEXT_NOT_FOUND") ||
          digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
        )
          throw error;
        return {
          ok: false,
          message:
            "No pudimos confirmar el resultado. Actualiza la página para comprobarlo antes de repetir la operación. Si sigue fallando, contacta a soporte.",
        };
      }
    },
    [action],
  );
  const [state, formAction, pending] = useActionState(safeAction, null);
  return (
    <form action={formAction} className="practice-form" aria-busy={pending}>
      {children}
      <button className="button human" type="submit" disabled={pending}>
        {pending ? "Guardando…" : submit}
      </button>
      {state ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "hint" : "form-error"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
export function TimeZoneSelect({
  value = "America/Caracas",
}: {
  value?: string;
}) {
  return (
    <label>
      Zona horaria
      <select name="timeZone" defaultValue={value} required>
        {Array.from(new Set([value, ...TIME_ZONES])).map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </select>
    </label>
  );
}
export function CurrencySelect() {
  return (
    <label>
      Moneda
      <select name="currency" defaultValue="usd">
        <option value="usd">USD · dólares</option>
        <option value="eur">EUR · euros</option>
        <option value="ves">VES · bolívares</option>
      </select>
    </label>
  );
}
