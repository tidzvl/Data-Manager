import Link from "next/link";
import type { MovementType } from "@prisma/client";
import { getOrderSummaries } from "@/lib/aggregate";
import { getGridPage } from "@/lib/grid";
import { GRID_SORTS, MUC_TYPES, type GridSort } from "@/lib/grid-types";
import ThemeToggle from "@/components/theme/ThemeToggle";
import Pagination from "@/components/Pagination";
import OrdersDashboard from "@/components/sheet/OrdersDashboard";
import SearchBar from "./SearchBar";
import OrderList from "./OrderList";
import RootFab from "./RootFab";

export const dynamic = "force-dynamic";

const PER_PAGE_CHOICES = [10, 20, 50];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    f?: string;
    q?: string;
    page?: string;
    /** desktop: lọc ngày có phiếu */
    day?: string;
    /** desktop: lọc theo mục */
    muc?: string;
    /** desktop: số LSX mỗi trang */
    per?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const { f, q, page, day, muc, per, sort, dir } = await searchParams;
  const status = f === "done" ? "DONE" : f === "active" ? "ACTIVE" : undefined;
  const current = Math.max(1, parseInt(page ?? "1", 10) || 1);

  const perPage = PER_PAGE_CHOICES.includes(parseInt(per ?? "", 10))
    ? parseInt(per!, 10)
    : 20;
  const mucFilter = MUC_TYPES.includes(muc as MovementType)
    ? (muc as MovementType)
    : undefined;
  const sortKey: GridSort = GRID_SORTS.includes(sort as GridSort)
    ? (sort as GridSort)
    : "createdAt";
  const sortDir: "asc" | "desc" = dir === "asc" ? "asc" : "desc";

  // Server không biết bề rộng màn hình nên phải dựng sẵn cả hai bản.
  const [mobile, grid] = await Promise.all([
    getOrderSummaries({ status, q, page: current }),
    getGridPage({
      q,
      day,
      muc: mucFilter,
      page: current,
      perPage,
      sort: sortKey,
      dir: sortDir,
    }),
  ]);

  /** Giữ q + filter, đổi các tham số được truyền vào. */
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (f) p.set("f", f);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  // Đổi filter thì về trang 1
  const filterHref = (fv?: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (fv) p.set("f", fv);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  const chips = [
    { href: filterHref(), active: !status, label: "Tất cả" },
    { href: filterHref("active"), active: status === "ACTIVE", label: "Đang chạy" },
    { href: filterHref("done"), active: status === "DONE", label: "Hoàn thành" },
  ];

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
            <span className="nums">{mobile.total}</span> kết quả cho “{q}”
          </p>
        )}

        <OrderList orders={mobile.items} searching={!!q} />
        <Pagination
          page={mobile.page}
          totalPages={mobile.totalPages}
          total={mobile.total}
          unit="lệnh sản xuất"
          makeHref={(p) => href({ page: p > 1 ? String(p) : undefined })}
        />
        <RootFab />
      </main>

      {/* ---------- DESKTOP: bảng LSX kiểu bảng tính ---------- */}
      <div className="hidden lg:block">
        <OrdersDashboard data={grid} />
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
