import Link from "next/link";
import { getOrderSummaries, ORDER_SORTS, type OrderSort } from "@/lib/aggregate";
import ThemeToggle from "@/components/theme/ThemeToggle";
import Pagination from "@/components/Pagination";
import SearchBar from "./SearchBar";
import OrderList from "./OrderList";
import OrdersTable from "./OrdersTable";
import DesktopActions from "./DesktopActions";
import RootFab from "./RootFab";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    f?: string;
    q?: string;
    page?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const { f, q, page, sort, dir } = await searchParams;
  const status = f === "done" ? "DONE" : f === "active" ? "ACTIVE" : undefined;
  const current = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const sortKey: OrderSort = ORDER_SORTS.includes(sort as OrderSort)
    ? (sort as OrderSort)
    : "createdAt";
  const sortDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

  const result = await getOrderSummaries({
    status,
    q,
    page: current,
    sort: sortKey,
    dir: sortDir,
  });

  /** Giữ q + filter + sort, đổi các tham số được truyền vào. */
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f) p.set("f", f);
    if (sort) p.set("sort", sort);
    if (dir) p.set("dir", dir);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  // Đổi filter hoặc cột sắp xếp thì về trang 1
  const filterHref = (fv?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (fv) p.set("f", fv);
    if (sort) p.set("sort", sort);
    if (dir) p.set("dir", dir);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };
  const sortHref = (key: OrderSort, d: "asc" | "desc") => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f) p.set("f", f);
    p.set("sort", key);
    p.set("dir", d);
    return `/?${p.toString()}`;
  };

  // Dựng sẵn URL cho từng cột — Client Component không nhận được hàm.
  const sortHrefs = Object.fromEntries(
    ORDER_SORTS.map((key) => [
      key,
      sortHref(key, sortKey === key && sortDir === "asc" ? "desc" : "asc"),
    ])
  ) as Record<OrderSort, string>;

  const chips = [
    { href: filterHref(), active: !status, label: "Tất cả" },
    { href: filterHref("active"), active: status === "ACTIVE", label: "Đang chạy" },
    { href: filterHref("done"), active: status === "DONE", label: "Hoàn thành" },
  ];

  const pager = (
    <Pagination
      page={result.page}
      totalPages={result.totalPages}
      total={result.total}
      unit="lệnh sản xuất"
      makeHref={(p) => href({ page: p > 1 ? String(p) : undefined })}
    />
  );

  return (
    <>
      {/* ---------- MOBILE ---------- */}
      <main className="px-4 pt-safe lg:hidden">
        <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-paper/80 px-4 pb-3 pt-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-xl font-bold tracking-tight">Lệnh sản xuất</h1>
            <ThemeToggle variant="icon" />
          </div>
          <div className="mt-3">
            <SearchBar />
          </div>
          <div className="mt-2.5 flex gap-2">
            {chips.map((c) => (
              <FilterChip key={c.label} {...c} />
            ))}
          </div>
        </header>

        {q && (
          <p className="mb-2 text-xs text-muted">
            <span className="nums">{result.total}</span> kết quả cho “{q}”
          </p>
        )}

        <OrderList orders={result.items} searching={!!q} />
        {pager}
        <RootFab />
      </main>

      {/* ---------- DESKTOP ---------- */}
      <div className="hidden px-8 py-6 lg:block">
        <header className="mb-5 flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Lệnh sản xuất</h1>
            <p className="mt-0.5 text-sm text-muted">
              <span className="nums">{result.total}</span> lệnh
              {q ? ` khớp “${q}”` : ""} · trang{" "}
              <span className="nums">{result.page}</span>/
              <span className="nums">{result.totalPages}</span>
            </p>
          </div>
          <DesktopActions />
        </header>

        <div className="mb-4 flex items-center gap-3">
          <div className="w-96">
            <SearchBar />
          </div>
          <div className="flex gap-2">
            {chips.map((c) => (
              <FilterChip key={c.label} {...c} />
            ))}
          </div>
        </div>

        <OrdersTable
          orders={result.items}
          sort={sortKey}
          dir={sortDir}
          sortHrefs={sortHrefs}
          searching={!!q}
        />
        {pager}
      </div>
    </>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand text-brand-fg"
          : "border border-line bg-surface text-muted hover:text-ink active:bg-surface-2"
      }`}
    >
      {label}
    </Link>
  );
}
