import Link from "next/link";
import { getOrderSummaries } from "@/lib/aggregate";
import ThemeToggle from "@/components/theme/ThemeToggle";
import SearchBar from "./SearchBar";
import OrderList from "./OrderList";
import RootFab from "./RootFab";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; q?: string }>;
}) {
  const { f, q } = await searchParams;
  const status = f === "done" ? "DONE" : f === "active" ? "ACTIVE" : undefined;
  const orders = await getOrderSummaries({ status, q });

  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
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
          <FilterChip href={keep({})} active={!status} label="Tất cả" />
          <FilterChip
            href={keep({ f: "active" })}
            active={status === "ACTIVE"}
            label="Đang chạy"
          />
          <FilterChip
            href={keep({ f: "done" })}
            active={status === "DONE"}
            label="Hoàn thành"
          />
        </div>
      </header>

      {q && (
        <p className="mb-2 text-xs text-muted">
          {orders.length} kết quả cho “{q}”
        </p>
      )}

      <OrderList orders={orders} searching={!!q} />
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
