import styles from "@/components/admin/shell.module.css";

export default function AdminLoading() {
  return (
    <section
      className={styles.shell}
      aria-busy="true"
      aria-label="Cargando administración"
    >
      <div className={styles.sidebar} aria-hidden="true">
        <div className={styles.brand}>
          <span className={styles.brandMark}>N</span>
          <strong>Nido</strong>
        </div>
      </div>
      <div className={styles.main}>
        <p role="status">Preparando tu administración…</p>
        <div className="practice-skeleton" aria-hidden="true">
          <div />
          <div />
          <div />
        </div>
      </div>
    </section>
  );
}
