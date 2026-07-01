import Link from "next/link";
import { absoluteUrl } from "@/lib/site";

type Crumb = { name: string; path: string };

/**
 * Migas de pan accesibles + `BreadcrumbList` JSON-LD desde una única fuente.
 *
 * Google exige que los datos estructurados reflejen el contenido visible, por
 * eso la lista visible y el schema se generan del mismo array. Habilita el
 * "rich snippet" de ruta en los resultados (mejor CTR) y orienta al usuario.
 *
 * Pasa la jerarquía SIN "Inicio": se antepone automáticamente.
 */
export function Breadcrumbs({ trail }: { trail: Crumb[] }) {
  const items: Crumb[] = [{ name: "Inicio", path: "/" }, ...trail];
  const last = items.length - 1;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };

  return (
    <nav
      aria-label="Ruta de navegación"
      style={{ margin: "0 0 var(--space-4, 1rem)", fontSize: "0.875rem" }}
    >
      <ol
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.25rem 0.5ch",
          listStyle: "none",
          margin: 0,
          padding: 0,
        }}
      >
        {items.map((item, index) => (
          <li
            key={item.path}
            style={{
              display: "inline-flex",
              gap: "0.5ch",
              alignItems: "center",
            }}
          >
            {index > 0 ? (
              <span aria-hidden="true" style={{ opacity: 0.5 }}>
                /
              </span>
            ) : null}
            {index === last ? (
              <span aria-current="page">{item.name}</span>
            ) : (
              <Link href={item.path}>{item.name}</Link>
            )}
          </li>
        ))}
      </ol>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD requiere serialización directa
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </nav>
  );
}
