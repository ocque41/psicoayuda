import styles from "./admission.module.css";

export function AdmissionLoading() {
  return (
    <section
      className={styles.workspace}
      aria-busy="true"
      aria-label="Admisión profesional"
    >
      <p className={styles.eyebrow}>Revisión profesional</p>
      <div className={styles.empty} role="status">
        <strong>Cargando admisión…</strong>
        <p>
          Estamos comprobando tus permisos y recuperando las etapas guardadas.
        </p>
      </div>
    </section>
  );
}
