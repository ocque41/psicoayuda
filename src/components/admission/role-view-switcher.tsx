import Link from "next/link";
import type { AdmissionBoardData } from "@/lib/admission/types";
import styles from "./admission.module.css";
import { admissionViewHref } from "./view-model";

export function AdmissionViewSwitcher({
  paolaView,
  data,
}: {
  paolaView: boolean;
  data: Pick<AdmissionBoardData, "query" | "stageFilter" | "page">;
}) {
  return (
    <section
      className={styles.viewSwitcher}
      aria-label="Vista del panel de admisión"
    >
      <div>
        <strong>{paolaView ? "Vista de Paola" : "Panel de Paola"}</strong>
        <p>
          {paolaView
            ? "Ves el menú y las herramientas del rol de admisión. Sigues usando tu cuenta de Superadmin; cada cambio se registra con tu identidad."
            : "Revisa el proceso de admisión o entra en la misma interfaz que utiliza Paola."}
        </p>
      </div>
      <div className={styles.rowActions}>
        <Link
          className={styles.secondary}
          href={admissionViewHref(data, !paolaView)}
          prefetch={false}
        >
          {paolaView ? "Vista de Superadmin" : "Vista de Paola"}
        </Link>
        {paolaView ? (
          <Link className={styles.secondary} href="/admin" prefetch={false}>
            Volver a administración
          </Link>
        ) : null}
      </div>
    </section>
  );
}
