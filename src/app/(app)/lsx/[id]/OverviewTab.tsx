import {
  ClipboardList,
  Scissors,
  Shirt,
  Sparkles,
  PackageCheck,
  AlertTriangle,
  Factory,
  CalendarDays,
} from "lucide-react";
import type { OrderDetail } from "@/lib/aggregate";
import { computeProgress } from "@/lib/aggregate";
import ProgressBar, { pct } from "@/components/ProgressBar";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function OverviewTab({ detail }: { detail: OrderDetail }) {
  const p = computeProgress(detail);
  const sewnPct = pct(p.sewnDone, p.sewnTarget);
  const detailPct = pct(p.detailDone, p.detailTarget);

  const shortfalls: { label: string; short: number }[] = [];
  for (const c of detail.categories)
    for (const s of c.sizes) {
      const short = s.targetQty - (detail.sewInBySize[s.id] ?? 0);
      if (short > 0)
        shortfalls.push({ label: `${c.name} · ${s.sizeLabel}`, short });
    }
  shortfalls.sort((a, b) => b.short - a.short);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5">
          <Factory size={14} className="text-brand" />
          <span className="font-semibold">
            {detail.lineName ?? "Chưa gán chuyền"}
          </span>
        </span>
        <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-muted">
          <CalendarDays size={14} />
          <span className="nums">{formatDate(detail.createdAt)}</span>
        </span>
      </div>

      {/* Meter: hàng đã may so với kế hoạch */}
      <div className="panel rounded-[var(--radius-card)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-faint">
              Hàng đã may / kế hoạch
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="nums text-3xl font-bold text-brand">
                {sewnPct}%
              </span>
              <span className="nums text-sm text-muted">
                {p.sewnDone}/{p.sewnTarget}
              </span>
            </div>
          </div>
          <Ring value={sewnPct} />
        </div>
      </div>

      {/* Dòng chảy sản xuất: chi tiết → may → thêu */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Quy trình</h3>
        <div className="grid grid-cols-5 gap-1">
          <Node
            Icon={ClipboardList}
            label="Kế hoạch"
            value={p.sewnTarget}
            tone="text-muted"
          />
          <Node
            Icon={Scissors}
            label="Chi tiết xuất"
            value={p.detailDone}
            sub={`${detailPct}%`}
            tone="text-brand"
          />
          <Node
            Icon={Shirt}
            label="Đã may"
            value={p.sewnDone}
            sub={`${sewnPct}%`}
            tone="text-brand"
          />
          <Node
            Icon={Sparkles}
            label="Ở thêu"
            value={p.atEmbroidery}
            tone={p.atEmbroidery > 0 ? "text-warn" : "text-faint"}
          />
          <Node
            Icon={PackageCheck}
            label="Thêu xong"
            value={p.embBack}
            tone="text-ok"
          />
        </div>
        <p className="mt-1.5 text-center text-[11px] text-faint">
          
        </p>
      </section>

      {/* Cần chú ý */}
      {shortfalls.length > 0 && (
        <section className="rounded-[var(--radius-card)] border border-line bg-short-soft/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-short">
            <AlertTriangle size={15} /> Chuyền còn thiếu hàng đã may
          </div>
          <div className="flex flex-wrap gap-1.5">
            {shortfalls.slice(0, 10).map((s, i) => (
              <span
                key={i}
                className="nums rounded-md border border-line bg-surface px-2 py-1 text-xs"
              >
                {s.label}:{" "}
                <span className="font-semibold text-short">−{s.short}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Tiến độ từng phân loại */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Hàng đã may theo phân loại</h3>
        <div className="space-y-3">
          {detail.categories.map((c) => {
            const done = c.sizes.reduce(
              (a, s) => a + (detail.sewInBySize[s.id] ?? 0),
              0
            );
            const target = c.sizes.reduce((a, s) => a + s.targetQty, 0);
            return (
              <div key={c.id} className="panel rounded-[var(--radius-card)] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{c.name}</span>
                  <span className="nums text-sm text-muted">
                    {done}/{target}
                  </span>
                </div>
                <ProgressBar done={done} target={target} />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {c.sizes.map((s) => {
                    const d = detail.sewInBySize[s.id] ?? 0;
                    const ok = s.targetQty - d <= 0;
                    return (
                      <span
                        key={s.id}
                        className={`nums rounded-lg px-2 py-1 text-xs font-medium ${
                          ok ? "bg-ok-soft text-ok" : "bg-short-soft text-short"
                        }`}
                      >
                        {s.sizeLabel}: {d}/{s.targetQty}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {detail.categories.length === 0 && (
            <p className="text-sm text-muted">Chưa khai báo phân loại nào.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function Node({
  Icon,
  label,
  value,
  sub,
  tone,
}: {
  Icon: typeof ClipboardList;
  label: string;
  value: number;
  sub?: string;
  tone: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-line bg-surface px-0.5 py-2.5 text-center">
      <Icon size={15} className={tone} />
      <span className={`nums mt-1 text-base font-bold ${tone}`}>{value}</span>
      {sub && <span className="nums text-[10px] text-faint">{sub}</span>}
      <span className="mt-0.5 text-[9px] leading-tight text-muted">{label}</span>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="var(--color-surface-2)"
        strokeWidth="6"
      />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ filter: "drop-shadow(0 0 4px var(--color-brand))" }}
      />
    </svg>
  );
}
