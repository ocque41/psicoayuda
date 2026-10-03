import Link from "next/link";
export function PracticePagination({
  page,
  pages,
  total,
  href,
}: {
  page: number;
  pages: number;
  total: number;
  href: (page: number) => string;
}) {
  return (
    <nav className="practice-pagination" aria-label="Páginas de resultados">
      <p className="hint">
        {total} resultados · Página {page} de {pages}
      </p>
      <div>
        {page > 1 ? (
          <Link
            className="button secondary"
            href={href(page - 1)}
            scroll={false}
          >
            ← Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link
            className="button secondary"
            href={href(page + 1)}
            scroll={false}
          >
            Siguiente →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
