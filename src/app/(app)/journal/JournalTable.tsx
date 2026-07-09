"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Pencil, Trash2, StickyNote, ChevronRight, ExternalLink } from "lucide-react";
import type { MovementView } from "@/lib/aggregate";
import { MOVEMENT_SHORT, MOVEMENT_ACCENT } from "@/lib/labels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import MovementFormModal, {
  type MovementModalTarget,
} from "@/components/forms/MovementFormModal";
import { deleteMovement } from "@/app/actions/movements";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function JournalTable({
  movements,
  filtered,
}: {
  movements: MovementView[];
  filtered: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [del, setDel] = useState<MovementView | null>(null);
  const [editTarget, setEditTarget] = useState<MovementModalTarget | null>(null);
  const [pending, startTransition] = useTransition();

  const confirmDelete = () => {
    if (!del) return;
    const { id, orderId } = del;
    startTransition(async () => {
      await deleteMovement(id, orderId);
      toast.success("Đã xoá phiếu");
    });
  };

  if (movements.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-dashed border-line py-20 text-center text-sm text-muted">
        {filtered ? "Không có phiếu nào khớp bộ lọc." : "Chưa có phiếu nào."}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <table className="dt">
          <thead>
            <tr>
              <th className="w-8" />
              <th>Ngày</th>
              <th>Loại phiếu</th>
              <th>Mã LSX</th>
              <th>Chuyền may</th>
              <th>Ghi chú</th>
              <th className="!text-right">Tổng SL</th>
              <th className="w-32 !text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
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
                        className={`rounded-md px-2 py-0.5 text-xs font-medium ${MOVEMENT_ACCENT[m.type]}`}
                      >
                        {MOVEMENT_SHORT[m.type]}
                      </span>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/lsx/${m.orderId}`}
                        className="nums font-semibold text-brand hover:underline"
                      >
                        {m.orderCode}
                      </Link>
                    </td>
                    <td className="text-muted">
                      {m.lineName ?? <span className="text-faint">—</span>}
                    </td>
                    <td className="max-w-[20rem] truncate text-muted">
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
                            setEditTarget({
                              orderId: m.orderId,
                              movementId: m.id,
                            })
                          }
                          aria-label="Sửa phiếu"
                          title="Sửa phiếu"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-brand"
                        >
                          <Pencil size={14} />
                        </button>
                        <Link
                          href={`/lsx/${m.orderId}`}
                          aria-label="Mở LSX"
                          title="Mở LSX"
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:text-ink"
                        >
                          <ExternalLink size={14} />
                        </Link>
                        <button
                          onClick={() => setDel(m)}
                          disabled={pending}
                          aria-label="Xoá phiếu"
                          title="Xoá phiếu"
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
                      <td colSpan={7} className="py-3">
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

      <ConfirmDialog
        open={del != null}
        onOpenChange={(v) => !v && setDel(null)}
        title="Xoá phiếu này?"
        description={`Phiếu ${del ? MOVEMENT_SHORT[del.type] : ""} của ${del?.orderCode ?? ""}. Số liệu đã gửi/còn thiếu sẽ được tính lại.`}
        confirmLabel="Xoá"
        danger
        onConfirm={confirmDelete}
      />

      <MovementFormModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
      />
    </>
  );
}
