import Link from "next/link";
export function PracticePagination({
  page,
  pages,
  total,
  href,
  prefetch,
}: {
  page: number;
  pages: number;
  total: number;
  href: (page: number) => string;
  prefetch?: boolean;
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
            prefetch={prefetch}
            scroll={false}
          >
            ← Anterior
          </Link>
        ) : null}
        {page < pages ? (
          <Link
            className="button secondary"
            href={href(page + 1)}
            prefetch={prefetch}
            scroll={false}
          >
            Siguiente →
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
