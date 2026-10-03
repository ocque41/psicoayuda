import styles from "./loading.module.css";

export function PracticeLoading() {
  return (
    <section
      className={`section ${styles.loading}`}
      aria-busy="true"
      aria-label="Cargando"
    >
      <div className="container practice-shell">
        <p role="status">Preparando tu espacio…</p>
        <div className="practice-skeleton" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      </div>
    </section>
  );
}
