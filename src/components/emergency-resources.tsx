import {
  EMERGENCY_RESOURCES,
  type EmergencyCategory,
  type EmergencyLink,
  priorityCategory,
} from "@/lib/emergency-resources";
import { withUtm } from "@/lib/utm";

// Una fila: punto de color + enlace externo (abre en otra pestaña) + flecha a la
// derecha. El aviso de estado ("parece no estar operativa") va en gris. Los
// divisores entre filas viven en CSS (`.emergency-row`).
function LinkRow({ resource }: { resource: EmergencyLink }) {
  return (
    <li className="emergency-row">
      <span className="emergency-dot" aria-hidden="true" />
      <a
        className="emergency-row-link"
        href={withUtm(resource.url, { campaign: "emergencia" })}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>
          {resource.label}
          {resource.note ? (
            <span className="emergency-note"> — {resource.note}</span>
          ) : null}
        </span>
        <span className="emergency-arrow" aria-hidden="true">
          ↗
        </span>
      </a>
    </li>
  );
}

// Cabecera de categoría (gris mayúscula) + sus enlaces en filas.
function CategoryBlock({ category }: { category: EmergencyCategory }) {
  return (
    <div>
      <p className="emergency-cat-title">{category.title}</p>
      <ul className="emergency-list">
        {category.links.map((resource) => (
          <LinkRow key={`${category.id}-${resource.url}`} resource={resource} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Recurso PRIORITARIO (búsqueda de niños) en una caja roja destacada, para que
 * salte a la vista arriba del todo. El halo titilante vive en CSS
 * (`.emergency-priority`) y se detiene bajo `prefers-reduced-motion`. Si no hay
 * categoría prioritaria, no renderiza nada.
 */
export function EmergencyPriorityBar() {
  if (!priorityCategory || priorityCategory.links.length === 0) return null;
  return (
    <div className="emergency-priority">
      <CategoryBlock category={priorityCategory} />
    </div>
  );
}

/**
 * Directorio de recursos EXTERNOS de respuesta al terremoto, por categoría
 * (búsqueda de personas, daños estructurales, acopio, refugios, salud, mascotas…)
 * en formato lista con punto + flecha + divisores. Excluye la categoría
 * prioritaria (esa va destacada aparte con `EmergencyPriorityBar`). Todos los
 * enlaces abren en otra pestaña.
 */
export function EmergencyResourcesDirectory({
  title = "Plataformas aliadas",
}: {
  title?: string;
}) {
  const categories = EMERGENCY_RESOURCES.filter(
    (category) => !category.priority,
  );
  if (categories.length === 0) return null;

  return (
    <section aria-labelledby="recursos-emergencia-titulo">
      <h2 id="recursos-emergencia-titulo">{title}</h2>
      <p className="lead">
        Directorios que la comunidad ha levantado para buscar personas, reportar
        daños, ubicar centros de acopio, refugios y más. Son webs externas a
        Nido; se abren en otra pestaña.
      </p>
      {categories.map((category) => (
        <CategoryBlock key={category.id} category={category} />
      ))}
    </section>
  );
}
