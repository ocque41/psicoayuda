import {
  EMERGENCY_RESOURCES,
  priorityCategory,
} from "@/lib/emergency-resources";

/**
 * Barra roja titilante con el recurso PRIORITARIO (búsqueda de niños) para que
 * salte a la vista arriba del todo. Es un enlace externo (se abre en otra
 * pestaña). El titilar vive en CSS (`.emergency-priority`) y se detiene bajo
 * `prefers-reduced-motion`. Si no hay categoría prioritaria, no renderiza nada.
 */
export function EmergencyPriorityBar() {
  const first = priorityCategory?.links[0];
  if (!priorityCategory || !first) return null;

  return (
    <a
      className="emergency-priority"
      href={first.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${priorityCategory.title}: abrir ${first.label} en otra pestaña`}
    >
      <span>
        <span aria-hidden="true">🔴 </span>
        {priorityCategory.title}
      </span>
      <span className="emergency-priority-domain">
        {first.label} <span aria-hidden="true">↗</span>
      </span>
    </a>
  );
}

/**
 * Directorio de recursos EXTERNOS de respuesta al terremoto, agrupados por
 * categoría (búsqueda de personas, daños estructurales, acopio, refugios, salud,
 * mascotas…). Todos los enlaces abren en otra pestaña; algunos llevan un aviso
 * de estado (p. ej. "parece no estar operativa"). Se muestran todas las
 * categorías, incluida la prioritaria (que además va destacada arriba).
 */
export function EmergencyResourcesDirectory() {
  return (
    <section
      aria-labelledby="recursos-emergencia-titulo"
      style={{ marginTop: "var(--space-10)" }}
    >
      <h2 id="recursos-emergencia-titulo">Otros recursos por el terremoto</h2>
      <p className="lead">
        Directorios que la comunidad ha levantado para buscar personas, reportar
        daños, ubicar centros de acopio, refugios y más. Son webs externas a
        Nido; se abren en otra pestaña.
      </p>
      <div className="grid grid-2">
        {EMERGENCY_RESOURCES.map((category) => (
          <article className="card" key={category.id}>
            <h3 style={{ marginTop: 0 }}>{category.title}</h3>
            <ul className="emergency-links">
              {category.links.map((resource) => (
                <li key={`${category.id}-${resource.url}`}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {resource.label} <span aria-hidden="true">↗</span>
                  </a>
                  {resource.note ? (
                    <span className="muted"> — {resource.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
