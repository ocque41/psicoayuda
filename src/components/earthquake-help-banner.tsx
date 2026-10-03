import Link from "next/link";
import styles from "./earthquake-help-banner.module.css";

export function EarthquakeHelpBanner() {
  return (
    <aside className={styles.banner} aria-label="Ayuda Terremoto gratuita">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.title}>
            Ayuda Terremoto · Apoyo psicológico gratuito
          </p>
          <p className={styles.detail}>
            Para personas afectadas, según disponibilidad.
          </p>
        </div>
        <Link className={styles.link} href="/ayuda">
          Solicitar ayuda <span aria-hidden="true">→</span>
        </Link>
      </div>
    </aside>
  );
}
