import Link from "next/link";
import { getOrderSummaries } from "@/lib/aggregate";
import ThemeToggle from "@/components/theme/ThemeToggle";
import Pagination from "@/components/Pagination";
import SearchBar from "./SearchBar";
import OrderList from "./OrderList";
import RootFab from "./RootFab";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string; page?: string }>;
}) {
  const { f, q, page } = await searchParams;
  const status = f === "done" ? "DONE" : f === "active" ? "ACTIVE" : undefined;
  const current = Math.max(1, parseInt(page ?? "1", 10) || 1);

  const result = await getOrderSummaries({ status, q, page: current });

  /** Giữ q + filter, đổi page (bỏ page = quay về trang 1). */
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

  return (
    <main className="px-4 pt-safe">
      <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-paper/80 px-4 pb-3 pt-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold tracking-tight">Lệnh sản xuất</h1>
          <ThemeToggle variant="icon" />
        </div>

        <div className="mt-3">
          <SearchBar />
        </div>

        <div className="mt-2.5 flex gap-2">
          <FilterChip href={filterHref()} active={!status} label="Tất cả" />
          <FilterChip
            href={filterHref("active")}
            active={status === "ACTIVE"}
            label="Đang chạy"
          />
          <FilterChip
            href={filterHref("done")}
            active={status === "DONE"}
            label="Hoàn thành"
          />
        </div>
      </header>

      {q && (
        <p className="mb-2 text-xs text-muted">
          <span className="nums">{result.total}</span> kết quả cho “{q}”
        </p>
      )}

      <OrderList orders={result.items} searching={!!q} />

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        unit="lệnh sản xuất"
        makeHref={(p) => href({ page: p > 1 ? String(p) : undefined })}
      />

      <RootFab />
    </main>
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
          : "border border-line bg-surface text-muted active:bg-surface-2"
      }`}
    >
      {label}
    </Link>
  );
}
