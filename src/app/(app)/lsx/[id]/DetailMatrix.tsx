"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { OrderDetail } from "@/lib/aggregate";
import { ps } from "@/lib/keys";

export default function DetailMatrix({ detail }: { detail: OrderDetail }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Chi tiết đã xuất về chuyền may, so với SL cần xuất của từng size.
      </p>

      {detail.categories.map((c) => (
        <section key={c.id}>
          <h3 className="mb-2 text-sm font-semibold">{c.name}</h3>
          {c.parts.length === 0 ? (
            <p className="text-sm text-muted">Chưa khai báo chi tiết.</p>
          ) : (
            <div className="space-y-2">
              {c.parts.map((p) => (
                <PartRow key={p.id} detail={detail} category={c} part={p} />
              ))}
            </div>
          )}
        </section>
      ))}
      {detail.categories.length === 0 && (
        <p className="text-sm text-muted">Chưa có dữ liệu.</p>
      )}
    </div>
  );
}

function PartRow({
  detail,
  category,
  part,
}: {
  detail: OrderDetail;
  category: OrderDetail["categories"][number];
  part: OrderDetail["categories"][number]["parts"][number];
}) {
  const [open, setOpen] = useState(false);

  let totDone = 0;
  let totTarget = 0;
  const rows = category.sizes.map((s) => {
    const target = part.targets[s.id] ?? 0;
    const done = detail.sewOut[ps(part.id, s.id)] ?? 0;
    totDone += done;
    totTarget += target;
    return { size: s.sizeLabel, target, done };
  });

  const short = totTarget - totDone;
  const complete = totTarget > 0 && short <= 0;

  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-surface"
      style={part.color ? { borderLeft: `3px solid ${part.color}` } : undefined}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-3 text-left active:bg-surface-2"
      >
        {part.color && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: part.color }}
          />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{part.name}</span>
        <span
          className={`nums text-sm font-semibold ${
            complete ? "text-ok" : "text-ink"
          }`}
        >
          {totDone}
          <span className="font-normal text-muted">/{totTarget}</span>
        </span>
        {short > 0 && (
          <span className="nums rounded-md bg-short-soft px-1.5 py-0.5 text-xs font-medium text-short">
            −{short}
          </span>
        )}
        <ChevronDown
          size={18}
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-line">
          {rows.map((r, i) => {
            const rowShort = r.target - r.done;
            const ok = r.target > 0 && rowShort <= 0;
            return (
              <div
                key={i}
                className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-0"
              >
                <span className="nums w-16 font-semibold">{r.size}</span>
                <span className="nums flex-1 text-sm">
                  {r.done}
                  <span className="text-muted">/{r.target}</span>
                </span>
                {ok ? (
                  <span className="rounded-md bg-ok-soft px-1.5 py-0.5 text-xs font-medium text-ok">
                    đủ
                  </span>
                ) : (
                  <span className="nums rounded-md bg-short-soft px-1.5 py-0.5 text-xs font-medium text-short">
                    thiếu {rowShort}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
