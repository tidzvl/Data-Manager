"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  StickyNote,
  Search,
  X,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import type { MovementView } from "@/lib/aggregate";
import type { MovementType } from "@prisma/client";
import {
  MOVEMENT_SHORT,
  MOVEMENT_TYPES,
  movementAccent,
  movementShort,
} from "@/lib/labels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import MovementFormModal, {
  type MovementModalTarget,
} from "@/components/forms/MovementFormModal";
import { deleteMovement } from "@/app/actions/movements";

const PER_PAGE = 20;

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function HistoryTable({
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
  const [editTarget, setEditTarget] = useState<MovementModalTarget | null>(null);
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();

  useEffect(() => setPage(1), [filter, q, day]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return movements.filter((m) => {
      if (filter !== "all" && m.type !== filter) return false;
      if (day && m.date !== day) return false;
      if (!needle) return true;
      const hay = [
        m.note ?? "",
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, totalPages);
  const rows = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const hasFilter = filter !== "all" || q.trim() !== "" || day !== "";

  const confirmDelete = () => {
    if (delId == null) return;
    const id = delId;
    startTransition(async () => {
      await deleteMovement(id, orderId);
      toast.success("Đã xoá phiếu");
    });
  };

  return (
    <div className="space-y-3">
      {/* Bộ lọc */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm chi tiết, size, ghi chú…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-line"
          />
        </div>
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          aria-label="Lọc theo ngày"
          className="nums rounded-lg border border-line bg-surface px-2 py-2 text-sm outline-none focus:border-brand-line"
        />
        <div className="flex gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            Tất cả
          </Chip>
          {MOVEMENT_TYPES.map((t) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
              {MOVEMENT_SHORT[t]}
            </Chip>
          ))}
        </div>
        {hasFilter && (
          <button
            onClick={() => {
              setFilter("all");
              setQ("");
              setDay("");
            }}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-2 text-sm text-muted hover:text-ink"
          >
            <X size={14} /> Xoá lọc
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-line py-14 text-center text-sm text-muted">
          {hasFilter ? "Không có phiếu nào khớp bộ lọc." : "Chưa có phiếu nào."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <table className="dt">
            <thead>
              <tr>
                <th className="w-8" />
                <th>Ngày</th>
                <th>Loại phiếu</th>
                <th>Ghi chú</th>
                <th className="!text-right">Tổng SL</th>
                <th className="w-32 !text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const open = openId === m.id;
                return (
                  <Fragment key={m.id}>
                    <tr
                      onClick={() => setOpenId(open ? null : m.id)}
                      className="cursor-pointer"
                    >
                      <td>
                        <ChevronRight
                          size={15}
                          className={`text-faint transition-transform ${
                            open ? "rotate-90" : ""
                          }`}
                        />
                      </td>
                      <td className="nums text-muted">{formatDate(m.date)}</td>
                      <td>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${movementAccent(m.type)}`}
                        >
                          {movementShort(m.type, m.stageName)}
                        </span>
                      </td>
                      <td className="max-w-[24rem] truncate text-muted">
                        {m.note ? (
                          <span className="inline-flex items-center gap-1.5">
                            <StickyNote size={12} className="text-warn" />
                            {m.note}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="num font-semibold">{m.total}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() =>
                              setEditTarget({ orderId, movementId: m.id })
                            }
                            aria-label="Sửa phiếu"
                            title="Sửa phiếu"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-brand"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDelId(m.id)}
                            disabled={pending}
                            aria-label="Xoá phiếu"
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-short disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {open && (
                      <tr className="!bg-surface-2">
                        <td />
                        <td colSpan={5} className="py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {m.items.map((it, i) => (
                              <span
                                key={i}
                                className="nums flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs text-muted"
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-end gap-2 text-sm">
          <span className="text-xs text-muted">
            Trang <span className="nums font-semibold text-ink">{current}</span>/
            <span className="nums">{totalPages}</span> ·{" "}
            <span className="nums">{filtered.length}</span> phiếu
          </span>
          <button
            onClick={() => setPage(current - 1)}
            disabled={current <= 1}
            aria-label="Trang trước"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setPage(current + 1)}
            disabled={current >= totalPages}
            aria-label="Trang sau"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </nav>
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

      <MovementFormModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
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
      className={`rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-brand text-brand-fg"
          : "border border-line bg-surface text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
