import { getMovements } from "@/lib/aggregate";
import JournalList from "./JournalList";

export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const movements = await getMovements();
  return (
    <main className="px-4 pt-safe">
      <header className="sticky top-0 z-20 -mx-4 mb-3 bg-paper/95 px-4 pb-2 pt-3 backdrop-blur">
        <h1 className="text-xl font-bold tracking-tight">Nhật ký</h1>
        <p className="text-sm text-muted">Mọi phiếu theo ngày</p>
      </header>
      <JournalList movements={movements} />
    </main>
  );
}
