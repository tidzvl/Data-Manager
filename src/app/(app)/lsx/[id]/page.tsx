import { notFound } from "next/navigation";
import {
  getOrderDetail,
  getMovements,
  computeProgress,
} from "@/lib/aggregate";
import { pct } from "@/components/ProgressBar";
import SegmentedTabs from "@/components/SegmentedTabs";
import OverviewTab from "./OverviewTab";
import DetailMatrix from "./DetailMatrix";
import FinishedTab from "./FinishedTab";
import HistoryTab from "./HistoryTab";
import OrderMenu from "./OrderMenu";
import CreateMovementFab from "./CreateMovementFab";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Tổng quan" },
  { key: "detail", label: "Chi tiết" },
  { key: "finished", label: "May & Thêu" },
  { key: "history", label: "Lịch sử" },
];

export default async function OrderHubPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const orderId = Number(id);
  const detail = await getOrderDetail(orderId);
  if (!detail) notFound();

  const active = tab ?? "overview";
  const progress = computeProgress(detail);
  const movements = active === "history" ? await getMovements(orderId) : [];

  return (
    <main className="px-4">
      {/* Header sticky */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-surface/95 px-4 pb-3 pt-safe backdrop-blur">
        <div className="flex items-start justify-between gap-2 pt-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="nums text-lg font-bold text-brand">
                {detail.code}
              </span>
              {detail.status === "DONE" && (
                <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
                  Hoàn thành
                </span>
              )}
            </div>
            <p className="truncate text-sm text-muted">{detail.productName}</p>
          </div>
          <OrderMenu orderId={orderId} status={detail.status} />
        </div>

        <div className="mt-3 flex gap-4">
          <MiniStat
            label="Chi tiết xuất"
            value={pct(progress.detailDone, progress.detailTarget)}
          />
          <MiniStat
            label="Đã may"
            value={pct(progress.sewnDone, progress.sewnTarget)}
          />
          {progress.atEmbroidery > 0 && (
            <div className="ml-auto text-right">
              <div className="nums text-lg font-bold text-warn">
                {progress.atEmbroidery}
              </div>
              <div className="text-xs text-muted">đang ở thêu</div>
            </div>
          )}
        </div>

        <div className="mt-3">
          <SegmentedTabs tabs={TABS} />
        </div>
      </header>

      <div className="py-4">
        {active === "overview" && <OverviewTab detail={detail} />}
        {active === "detail" && <DetailMatrix detail={detail} />}
        {active === "finished" && <FinishedTab detail={detail} />}
        {active === "history" && (
          <HistoryTab orderId={orderId} movements={movements} />
        )}
      </div>

      <CreateMovementFab orderId={orderId} />
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="nums text-lg font-bold">{value}%</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
