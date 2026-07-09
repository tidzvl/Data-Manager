import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Pagination({
  page,
  totalPages,
  total,
  makeHref,
  unit = "mục",
}: {
  page: number;
  totalPages: number;
  total: number;
  /** Tạo URL cho 1 trang, giữ nguyên các query khác. */
  makeHref: (page: number) => string;
  unit?: string;
}) {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="py-3 text-center text-xs text-faint">
        <span className="nums">{total}</span> {unit}
      </p>
    ) : null;
  }

  const prev = page > 1 ? makeHref(page - 1) : null;
  const next = page < totalPages ? makeHref(page + 1) : null;

  return (
    <nav
      aria-label="Phân trang"
      className="flex items-center justify-between gap-2 py-3"
    >
      <PageLink href={prev} aria-label="Trang trước">
        <ChevronLeft size={18} />
      </PageLink>

      <div className="text-center text-xs text-muted">
        <div>
          Trang <span className="nums font-semibold text-ink">{page}</span> /{" "}
          <span className="nums">{totalPages}</span>
        </div>
        <div className="text-faint">
          <span className="nums">{total}</span> {unit}
        </div>
      </div>

      <PageLink href={next} aria-label="Trang sau">
        <ChevronRight size={18} />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  ...rest
}: {
  href: string | null;
  children: React.ReactNode;
  "aria-label": string;
}) {
  const base =
    "tap flex items-center justify-center rounded-xl border border-line px-4";
  if (!href) {
    return (
      <span
        {...rest}
        aria-disabled
        className={`${base} bg-surface text-faint opacity-40`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      {...rest}
      href={href}
      scroll
      className={`${base} bg-surface text-ink active:bg-surface-2`}
    >
      {children}
    </Link>
  );
}
