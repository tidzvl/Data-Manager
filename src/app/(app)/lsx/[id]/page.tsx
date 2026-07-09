import { notFound } from "next/navigation";
import {
  getOrderDetail,
  getOrderMovements,
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
import DesktopOrderView from "./desktop/DesktopOrderView";

export const dynamic = "force-dynamic";

const MOBILE_TABS = [
  { key: "overview", label: "Tổng quan" },
  { key: "detail", label: "Chi tiết" },
  { key: "finished", label: "May & Thêu" },
  { key: "history", label: "Lịch sử" },
];

const DESKTOP_TABS = ["detail", "finished", "history"];

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

  const mobileTab = tab ?? "overview";
  // Desktop không có tab "Tổng quan" (số liệu nằm ngay trên đầu trang)
  const desktopTab = DESKTOP_TABS.includes(tab ?? "") ? tab! : "detail";

  const progress = computeProgress(detail);
  const movements = tab === "history" ? await getOrderMovements(orderId) : [];

  return (
    <>
      {/* ---------- MOBILE ---------- */}
      <main className="px-4 lg:hidden">
        <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-paper/80 px-4 pb-3 pt-safe backdrop-blur-xl">
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
              <p className="truncate text-sm text-muted">
                {detail.productName}
              </p>
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
            <SegmentedTabs tabs={MOBILE_TABS} />
          </div>
        </header>

        <div className="py-4">
          {mobileTab === "overview" && <OverviewTab detail={detail} />}
          {mobileTab === "detail" && <DetailMatrix detail={detail} />}
          {mobileTab === "finished" && <FinishedTab detail={detail} />}
          {mobileTab === "history" && (
            <HistoryTab orderId={orderId} movements={movements} />
          )}
        </div>

        <CreateMovementFab orderId={orderId} />
      </main>

      {/* ---------- DESKTOP ---------- */}
      <div className="hidden lg:block">
        <DesktopOrderView
          detail={detail}
          tab={desktopTab}
          movements={movements}
        />
      </div>
    </>
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
