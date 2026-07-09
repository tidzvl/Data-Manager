import { getJournal } from "@/lib/aggregate";
import { MOVEMENT_TYPES } from "@/lib/labels";
import type { MovementType } from "@prisma/client";
import Pagination from "@/components/Pagination";
import JournalFilters from "./JournalFilters";
import JournalList from "./JournalList";

export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; t?: string; d?: string; page?: string }>;
}) {
  const { q, t, d, page } = await searchParams;
  const type = MOVEMENT_TYPES.includes(t as MovementType)
    ? (t as MovementType)
    : undefined;
  const current = Math.max(1, parseInt(page ?? "1", 10) || 1);

  const result = await getJournal({ q, type, day: d, page: current });
  const filtered = !!(q || type || d);

  const makeHref = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("t", type);
    if (d) params.set("d", d);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/journal?${s}` : "/journal";
  };

  return (
    <main className="px-4 pt-safe">
      <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-paper/80 px-4 pb-3 pt-3 backdrop-blur-xl">
        <h1 className="text-xl font-bold tracking-tight">Nhật ký</h1>
        <p className="text-sm text-muted">Mọi phiếu theo ngày</p>
        <div className="mt-3">
          <JournalFilters />
        </div>
      </header>

      <JournalList movements={result.items} filtered={filtered} />

      <Pagination
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        unit="phiếu"
        makeHref={makeHref}
      />
    </main>
  );
}
