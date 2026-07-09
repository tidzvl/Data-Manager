"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import type { MovementType } from "@prisma/client";
import type { OrderDetail } from "@/lib/aggregate";
import { ps } from "@/lib/keys";
import { MOVEMENT_TYPES, MOVEMENT_LABELS, isPartLevel } from "@/lib/labels";
import QtyInput from "@/components/QtyInput";
import { saveMovement, type MovementInput } from "@/app/actions/movements";

/** Gợi ý nguồn của mỗi công đoạn, hiện dưới ô "còn thiếu". */
const HINT: Record<MovementType, string> = {
  SEW_OUT: "So với SL chi tiết cần xuất",
  SEW_IN: "So với SL kế hoạch của LSX",
  EMB_OUT: "Chỉ gửi được phần đã may mà chưa gửi thêu",
  EMB_IN: "Chỉ nhận được phần đang nằm ở xưởng thêu",
};

function today(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

const key = (partId: number | null, sizeId: number) =>
  `${partId ?? 0}:${sizeId}`;

export type MovementFormInitial = {
  id?: number;
  type: MovementType;
  date: string;
  note: string;
  qty: Record<string, number>; // key(partId,sizeId) -> qty của chính phiếu này
};

export default function MovementForm({
  detail,
  initial,
  onSaved,
}: {
  detail: OrderDetail;
  initial: MovementFormInitial;
  /** Có = đang chạy trong modal: không điều hướng, để nơi gọi tự xử lý. */
  onSaved?: () => void;
}) {
  const router = useRouter();
  const embedded = !!onSaved;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<MovementType>(initial.type);
  const [date, setDate] = useState(initial.date || today());
  const [note, setNote] = useState(initial.note);
  const [qty, setQty] = useState<Record<string, number>>(initial.qty);

  const setQ = (k: string, v: number) => setQty((m) => ({ ...m, [k]: v }));

  /**
   * "Còn có thể nhập" cho 1 dòng, theo đúng công đoạn trong luồng.
   * `own` = phần do chính phiếu đang sửa đóng góp (phải cộng lại để không trừ 2 lần).
   */
  const remaining = (
    partId: number | null,
    sizeId: number,
    partTarget: number,
    sizeTarget: number
  ): number => {
    const own = initial.qty[key(partId, sizeId)] ?? 0;
    switch (type) {
      case "SEW_OUT": {
        const done = partId != null ? (detail.sewOut[ps(partId, sizeId)] ?? 0) : 0;
        return Math.max(0, partTarget - (done - own));
      }
      case "SEW_IN": {
        const done = detail.sewInBySize[sizeId] ?? 0;
        return Math.max(0, sizeTarget - (done - own));
      }
      case "EMB_OUT": {
        // trần = hàng đã may chưa gửi thêu
        const sewn = detail.sewInBySize[sizeId] ?? 0;
        const sent = detail.embOutBySize[sizeId] ?? 0;
        return Math.max(0, sewn - (sent - own));
      }
      case "EMB_IN": {
        // trần = hàng đang nằm ở xưởng thêu
        const sent = detail.embOutBySize[sizeId] ?? 0;
        const back = detail.embInBySize[sizeId] ?? 0;
        return Math.max(0, sent - (back - own));
      }
    }
  };

  type RowGroup = {
    catName: string;
    partId: number | null;
    partName: string | null;
    partColor: string | null;
    rows: {
      sizeId: number;
      sizeLabel: string;
      partTarget: number;
      sizeTarget: number;
    }[];
  };

  const groups: RowGroup[] = useMemo(() => {
    const out: RowGroup[] = [];
    for (const c of detail.categories) {
      if (isPartLevel(type)) {
        for (const p of c.parts) {
          out.push({
            catName: c.name,
            partId: p.id,
            partName: p.name,
            partColor: p.color,
            rows: c.sizes.map((s) => ({
              sizeId: s.id,
              sizeLabel: s.sizeLabel,
              partTarget: p.targets[s.id] ?? 0,
              sizeTarget: s.targetQty,
            })),
          });
        }
      } else if (c.sizes.length > 0) {
        out.push({
          catName: c.name,
          partId: null,
          partName: null,
          partColor: null,
          rows: c.sizes.map((s) => ({
            sizeId: s.id,
            sizeLabel: s.sizeLabel,
            partTarget: 0,
            sizeTarget: s.targetQty,
          })),
        });
      }
    }
    return out;
  }, [detail, type]);

  const fillAll = () =>
    setQty(() => {
      const next: Record<string, number> = {};
      for (const g of groups)
        for (const r of g.rows) {
          const need = remaining(g.partId, r.sizeId, r.partTarget, r.sizeTarget);
          if (need > 0) next[key(g.partId, r.sizeId)] = need;
        }
      return next;
    });

  const fillGroup = (g: RowGroup) =>
    setQty((m) => {
      const next = { ...m };
      for (const r of g.rows)
        next[key(g.partId, r.sizeId)] = remaining(
          g.partId,
          r.sizeId,
          r.partTarget,
          r.sizeTarget
        );
      return next;
    });

  const total = Object.values(qty).reduce((a, v) => a + (v || 0), 0);

  const submit = () => {
    setError(null);
    const items = Object.entries(qty)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => {
        const [pid, sid] = k.split(":").map((n) => parseInt(n, 10));
        return { partId: pid === 0 ? null : pid, orderSizeId: sid, quantity: v };
      });
    const payload: MovementInput = {
      id: initial.id,
      orderId: detail.id,
      type,
      date,
      note,
      items,
    };
    startTransition(async () => {
      const res = await saveMovement(payload);
      if (res.ok) {
        toast.success(initial.id ? "Đã cập nhật phiếu" : "Đã lưu phiếu");
        if (onSaved) onSaved();
        else router.push(`/lsx/${detail.id}?tab=history`);
      } else {
        setError(res.error ?? "Không lưu được.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  return (
    <div className="space-y-4 pb-8">
      {error && (
        <p className="rounded-lg bg-short-soft px-3 py-2 text-sm text-short">
          {error}
        </p>
      )}

      {/* Loại phiếu — theo đúng thứ tự luồng sản xuất */}
      <div className="xscroll -mx-4 px-4">
        <div className="flex gap-1.5">
          {MOVEMENT_TYPES.map((t, i) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                type === t
                  ? "bg-brand text-brand-fg"
                  : "border border-line bg-surface text-muted"
              }`}
            >
              <span className="nums opacity-60">{i + 1}</span>
              {MOVEMENT_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-sm">
          <span className="text-muted">Chuyền may</span>
          <span className="font-semibold">
            {detail.lineName ?? "— chưa gán —"}
          </span>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Ngày</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="tap w-full rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-line"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">
            Ghi chú (bù hàng…)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="VD: bù hàng thiếu ngày trước"
            className="tap w-full rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-line"
          />
        </label>
      </div>

      <div>
        <button
          onClick={fillAll}
          className="tap flex w-full items-center justify-center gap-2 rounded-xl border border-brand-line bg-brand-soft font-semibold text-brand active:opacity-80"
        >
          <Zap size={18} /> Điền hết số còn thiếu
        </button>
        <p className="mt-1.5 text-center text-xs text-muted">{HINT[type]}</p>
      </div>

      <div className="space-y-3">
        {groups.length === 0 && (
          <p className="text-sm text-muted">
            {isPartLevel(type)
              ? "LSX chưa có chi tiết nào."
              : "LSX chưa có kích thước nào."}
          </p>
        )}
        {groups.map((g, gi) => (
          <div
            key={gi}
            className="rounded-[var(--radius-card)] border border-line bg-surface p-3"
            style={
              g.partColor
                ? { borderLeft: `3px solid ${g.partColor}` }
                : undefined
            }
          >
            <div className="mb-2 flex items-center gap-2">
              {g.partColor && (
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: g.partColor }}
                />
              )}
              <span className="min-w-0 flex-1 truncate font-semibold">
                {g.catName}
                {g.partName ? ` · ${g.partName}` : ""}
              </span>
              <button
                onClick={() => fillGroup(g)}
                className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-medium text-brand active:bg-surface-2"
              >
                Điền thiếu
              </button>
            </div>
            <div className="xscroll -mx-1">
              <div className="flex gap-2 px-1 pb-1">
                {g.rows.map((r) => {
                  const need = remaining(
                    g.partId,
                    r.sizeId,
                    r.partTarget,
                    r.sizeTarget
                  );
                  const k = key(g.partId, r.sizeId);
                  return (
                    <div key={r.sizeId} className="shrink-0 text-center">
                      <div className="nums mb-1 text-xs font-semibold">
                        {r.sizeLabel}
                      </div>
                      <QtyInput
                        value={qty[k] ?? 0}
                        onChange={(v) => setQ(k, v)}
                        max={need}
                        ariaLabel={`SL size ${r.sizeLabel}`}
                      />
                      <div
                        className={`nums mt-1 text-xs ${
                          need > 0 ? "text-short" : "text-ok"
                        }`}
                      >
                        {need > 0 ? `còn ${need}` : "đủ"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div
        className={`z-20 flex items-center gap-2 ${
          embedded
            ? "sticky bottom-0 -mx-4 border-t border-line bg-paper px-4 py-3 sm:-mx-5 sm:px-5"
            : "sticky-above-nav"
        }`}
      >
        <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          Tổng: <span className="nums font-bold">{total}</span>
        </div>
        <button
          onClick={submit}
          disabled={pending}
          className="tap flex-1 rounded-xl bg-brand font-semibold text-brand-fg shadow-lg shadow-brand/20 disabled:opacity-60"
        >
          {pending ? "Đang lưu…" : "Lưu phiếu"}
        </button>
      </div>
    </div>
  );
}
