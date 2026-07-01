"use client";

import { useState } from "react";

export function AdminDeleteAccountForm({
  action,
  userId,
  accountLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  userId: string;
  accountLabel: string;
}) {
  const [deleting, setDeleting] = useState(false);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `¿Borrar definitivamente la cuenta ${accountLabel}? Esta acción no se puede deshacer.`,
        );
        if (!confirmed) {
          event.preventDefault();
          return;
        }
        setDeleting(true);
      }}
    >
      <input name="userId" type="hidden" value={userId} />
      <button
        className="button danger"
        type="submit"
        disabled={deleting}
        aria-busy={deleting}
        data-error-context="Borrar una cuenta desde administración"
      >
        {deleting ? "Borrando…" : "Borrar cuenta"}
      </button>
    </form>
  );
}
