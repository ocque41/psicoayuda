import styles from "@/components/admin/waitlist/waitlist.module.css";

export default function Loading() {
  return (
    <section
      className={`container ${styles.workspace}`}
      aria-label="Lista de espera"
      aria-busy="true"
    >
      <div className={styles.empty} role="status">
        <h2>Cargando lista de espera…</h2>
        <p>
          Estamos comprobando tu acceso y recuperando el seguimiento guardado.
        </p>
      </div>
    </section>
  );
}
