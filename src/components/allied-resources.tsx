import Link from "next/link";
import { ALLIED_CATEGORIES, ALLIED_CURATOR } from "@/lib/allied-resources";

export function AlliedResources() {
  return (
    <section className="card" aria-labelledby="aliadas-title">
      <h2 id="aliadas-title">Plataformas aliadas</h2>
      <p className="hint">
        Iniciativas ciudadanas de la emergencia, de terceros: Nido no las
        controla ni garantiza su disponibilidad. Curaduría basada en la red de{" "}
        <a href={ALLIED_CURATOR.url} target="_blank" rel="noopener noreferrer">
          {ALLIED_CURATOR.name}
        </a>
        .
      </p>

      <div className="allied-grid">
        {ALLIED_CATEGORIES.map((cat) => (
          <div className="allied-cat" key={cat.title}>
            <h3>{cat.title}</h3>
            {cat.description ? <p className="hint">{cat.description}</p> : null}
            <ul className="allied-links">
              {cat.links.map((link) => (
                <li key={link.url}>
                  {link.url.startsWith("/") ? (
                    <Link href={link.url}>{link.name}</Link>
                  ) : (
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.name} ↗
                    </a>
                  )}
                  {link.note ? (
                    <span className="allied-note"> · {link.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
