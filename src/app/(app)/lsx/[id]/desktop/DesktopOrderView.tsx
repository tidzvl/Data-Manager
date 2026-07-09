import Link from "next/link";
import {
  ClipboardList,
  Scissors,
  Shirt,
  Sparkles,
  PackageCheck,
  ChevronRight,
  Factory,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import type { OrderDetail, MovementView } from "@/lib/aggregate";
import { computeProgress } from "@/lib/aggregate";
import { pct } from "@/components/ProgressBar";
import OrderMenu from "../OrderMenu";
import OrderTree from "./OrderTree";
import DesktopTabs from "./DesktopTabs";
import MovementActions from "./MovementActions";
import PartsMatrixTable from "./PartsMatrixTable";
import SizesTable from "./SizesTable";
import HistoryTable from "./HistoryTable";

const TABS = [
  { key: "detail", label: "Chi tiết xuất" },
  { key: "finished", label: "May & Thêu" },
  { key: "history", label: "Lịch sử phiếu" },
];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function DesktopOrderView({
  detail,
  tab,
  movements,
}: {
  detail: OrderDetail;
  tab: string;
  movements: MovementView[];
}) {
  const p = computeProgress(detail);
  const sewnPct = pct(p.sewnDone, p.sewnTarget);
  const detailPct = pct(p.detailDone, p.detailTarget);

  const shortfalls: { label: string; short: number }[] = [];
  for (const c of detail.categories)
    for (const s of c.sizes) {
      const short = s.targetQty - (detail.sewInBySize[s.id] ?? 0);
      if (short > 0)
        shortfalls.push({ label: `${c.name}·${s.sizeLabel}`, short });
    }
  shortfalls.sort((a, b) => b.short - a.short);

  return (
    <div className="px-8 py-6">
      {/* Breadcrumb + header */}
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-muted">
        <Link href="/" className="hover:text-ink">
          Lệnh sản xuất
        </Link>
        <ChevronRight size={14} className="text-faint" />
        <span className="nums font-medium text-ink">{detail.code}</span>
      </nav>

      <header className="mb-5 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="nums text-2xl font-bold tracking-tight text-brand">
              {detail.code}
            </h1>
            {detail.status === "DONE" ? (
              <span className="rounded-full bg-ok-soft px-2.5 py-0.5 text-xs font-medium text-ok">
                Hoàn thành
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_6px_var(--color-brand)]" />
                Đang chạy
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink">{detail.productName}</p>
          <div className="mt-1.5 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Factory size={12} />
              {detail.lineName ?? "chưa gán chuyền"}
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays size={12} />
              <span className="nums">{formatDate(detail.createdAt)}</span>
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <MovementActions orderId={detail.id} />
          <OrderMenu orderId={detail.id} status={detail.status} />
        </div>
      </header>

      {/* Quy trình: 5 chặng nằm ngang */}
      <section className="mb-5 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Quy trình</h2>
          <p className="text-xs text-faint">
            Xuất chi tiết → chuyền trả hàng đã may → gửi đi thêu → nhận về
          </p>
        </div>
        <div className="flex items-stretch gap-2">
          <Stage
            Icon={ClipboardList}
            label="Kế hoạch"
            value={p.sewnTarget}
            tone="text-muted"
          />
          <Arrow />
          <Stage
            Icon={Scissors}
            label="Chi tiết đã xuất"
            value={p.detailDone}
            sub={`${detailPct}% của ${p.detailTarget}`}
            tone="text-brand"
            percent={detailPct}
          />
          <Arrow />
          <Stage
            Icon={Shirt}
            label="Đã may"
            value={p.sewnDone}
            sub={`${sewnPct}% của ${p.sewnTarget}`}
            tone="text-brand"
            percent={sewnPct}
          />
          <Arrow />
          <Stage
            Icon={Sparkles}
            label="Đang ở thêu"
            value={p.atEmbroidery}
            sub={`đã gửi ${p.embSent}`}
            tone={p.atEmbroidery > 0 ? "text-warn" : "text-faint"}
          />
          <Arrow />
          <Stage
            Icon={PackageCheck}
            label="Thêu xong"
            value={p.embBack}
            tone="text-ok"
          />
        </div>

        {shortfalls.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
            <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold text-short">
              <AlertTriangle size={13} /> Chuyền còn thiếu hàng đã may:
            </span>
            {shortfalls.slice(0, 12).map((s, i) => (
              <span
                key={i}
                className="nums rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs"
              >
                {s.label}{" "}
                <span className="font-semibold text-short">−{s.short}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Cây cấu trúc + bảng dữ liệu */}
      <div className="grid grid-cols-[22rem_minmax(0,1fr)] gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Cấu trúc lệnh</h2>
          <OrderTree detail={detail} />
        </div>

        <div className="min-w-0">
          <DesktopTabs tabs={TABS} current={tab} />
          <div className="pt-4">
            {tab === "detail" && <PartsMatrixTable detail={detail} />}
            {tab === "finished" && <SizesTable detail={detail} />}
            {tab === "history" && (
              <HistoryTable orderId={detail.id} movements={movements} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stage({
  Icon,
  label,
  value,
  sub,
  tone,
  percent,
}: {
  Icon: typeof ClipboardList;
  label: string;
  value: number;
  sub?: string;
  tone: string;
  percent?: number;
}) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <Icon size={13} className={tone} />
        {label}
      </div>
      <div className={`nums mt-1 text-2xl font-bold ${tone}`}>{value}</div>
      {sub && <div className="nums mt-0.5 text-[11px] text-faint">{sub}</div>}
      {percent != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface ring-1 ring-inset ring-line">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-700"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex shrink-0 items-center">
      <ChevronRight size={16} className="text-faint" />
    </div>
  );
}
