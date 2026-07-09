"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Pencil, Trash2, StickyNote, Search, X } from "lucide-react";
import type { MovementView } from "@/lib/aggregate";
import type { MovementType } from "@prisma/client";
import { MOVEMENT_SHORT, MOVEMENT_ACCENT, MOVEMENT_TYPES } from "@/lib/labels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { deleteMovement } from "@/app/actions/movements";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function HistoryTab({
  orderId,
  movements,
}: {
  orderId: number;
  movements: MovementView[];
}) {
  const [filter, setFilter] = useState<MovementType | "all">("all");
  const [q, setQ] = useState("");
  const [day, setDay] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return movements.filter((m) => {
      if (filter !== "all" && m.type !== filter) return false;
      if (day && m.date !== day) return false;
      if (!needle) return true;
      const hay = [
        m.note ?? "",
        m.lineName ?? "",
        ...m.items.flatMap((it) => [
          it.categoryName,
          it.partName ?? "",
          it.sizeLabel,
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [movements, filter, q, day]);

  const groups = new Map<string, MovementView[]>();
  for (const m of filtered) {
    if (!groups.has(m.date)) groups.set(m.date, []);
    groups.get(m.date)!.push(m);
  }

  const confirmDelete = () => {
    if (delId == null) return;
    const id = delId;
    startTransition(async () => {
      await deleteMovement(id, orderId);
      toast.success("Đã xoá phiếu");
    });
  };

  const hasFilter = filter !== "all" || q.trim() !== "" || day !== "";

  return (
    <div className="space-y-4">
      {/* Tìm kiếm + lọc ngày */}
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm chi tiết, size, ghi chú…"
            className="tap w-full rounded-xl border border-line bg-surface-2 pl-9 pr-3 text-sm outline-none focus:border-brand-line"
          />
        </div>
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label="Lọc theo ngày"
          className="tap nums shrink-0 rounded-xl border border-line bg-surface-2 px-2 text-sm outline-none focus:border-brand-line"
        />
      </div>

      <div className="xscroll -mx-4 px-4">
        <div className="flex gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Tất cả
          </Chip>
          {MOVEMENT_TYPES.map((t) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
              {MOVEMENT_SHORT[t]}
            </Chip>
          ))}
          {hasFilter && (
            <button
              onClick={() => {
                setFilter("all");
                setQ("");
                setDay("");
              }}
              className="flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm text-muted active:bg-surface-2"
            >
              <X size={14} /> Xoá lọc
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
          {hasFilter ? "Không có phiếu nào khớp bộ lọc." : "Chưa có phiếu nào."}
        </p>
      ) : (
        <div className="space-y-4">
          {[...groups.entries()].map(([date, list]) => (
            <div key={date}>
              <div className="mb-2 flex items-center gap-2">
                <span className="nums text-sm font-semibold">
                  {formatDate(date)}
                </span>
                <span className="h-px flex-1 bg-line" />
                <span className="nums text-xs text-faint">
                  {list.reduce((a, m) => a + m.total, 0)} sp
                </span>
              </div>
              <div className="space-y-2">
                {list.map((m) => (
                  <div
                    key={m.id}
                    className="overflow-hidden rounded-xl border border-line bg-surface"
                  >
                    <button
                      onClick={() =>
                        setOpenId((v) => (v === m.id ? null : m.id))
                      }
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-surface-2"
                    >
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${MOVEMENT_ACCENT[m.type]}`}
                      >
                        {MOVEMENT_SHORT[m.type]}
                      </span>
                      {m.note && (
                        <StickyNote size={13} className="shrink-0 text-warn" />
                      )}
                      <span className="nums ml-auto font-semibold">
                        {m.total}
                      </span>
                    </button>

                    {openId === m.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="border-t border-line px-3 py-2"
                      >
                        <div className="flex flex-wrap gap-1.5">
                          {m.items.map((it, i) => (
                            <span
                              key={i}
                              className="nums flex items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1 text-xs text-muted"
                            >
                              {it.partColor && (
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: it.partColor }}
                                />
                              )}
                              {it.categoryName}
                              {it.partName ? `·${it.partName}` : ""}·
                              {it.sizeLabel}:{" "}
                              <span className="font-semibold text-ink">
                                {it.quantity}
                              </span>
                            </span>
                          ))}
                        </div>
                        {m.note && (
                          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warn-soft px-2 py-1.5 text-xs text-warn">
                            <StickyNote size={13} className="mt-0.5 shrink-0" />
                            {m.note}
                          </p>
                        )}
                        <div className="mt-2 flex gap-2">
                          <Link
                            href={`/lsx/${orderId}/movement/${m.id}`}
                            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium active:bg-surface-2"
                          >
                            <Pencil size={14} /> Sửa
                          </Link>
                          <button
                            onClick={() => setDelId(m.id)}
                            disabled={pending}
                            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-short active:bg-surface-2 disabled:opacity-50"
                          >
                            <Trash2 size={14} /> Xoá
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={delId != null}
        onOpenChange={(v) => !v && setDelId(null)}
        title="Xoá phiếu này?"
        description="Số liệu đã gửi/còn thiếu sẽ được tính lại."
        confirmLabel="Xoá"
        danger
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand text-brand-fg"
          : "border border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}
