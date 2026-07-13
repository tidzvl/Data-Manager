"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Pencil, Trash2, StickyNote, ChevronDown } from "lucide-react";
import type { MovementView } from "@/lib/aggregate";
import { movementAccent, movementShort } from "@/lib/labels";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import MovementFormModal, {
  type MovementModalTarget,
} from "@/components/forms/MovementFormModal";
import { deleteMovement } from "@/app/actions/movements";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function JournalList({
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
      <p className="py-10 text-center text-sm text-muted">
        {filtered ? "Không có phiếu nào khớp bộ lọc." : "Chưa có phiếu nào."}
      </p>
    );
  }

  const groups = new Map<string, MovementView[]>();
  for (const m of movements) {
    if (!groups.has(m.date)) groups.set(m.date, []);
    groups.get(m.date)!.push(m);
  }

  return (
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
            {list.map((m) => {
              const open = openId === m.id;
              return (
                <div
                  key={m.id}
                  className="overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <button
                    onClick={() => setOpenId(open ? null : m.id)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left active:bg-surface-2"
                  >
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${movementAccent(m.type)}`}
                    >
                      {movementShort(m.type, m.stageName)}
                    </span>
                    <span className="nums shrink-0 text-sm font-semibold text-brand">
                      {m.orderCode}
                    </span>
                    {m.lineName && (
                      <span className="truncate text-sm text-muted">
                        {m.lineName}
                      </span>
                    )}
                    {m.note && (
                      <StickyNote size={13} className="shrink-0 text-warn" />
                    )}
                    <span className="nums ml-auto shrink-0 font-semibold">
                      {m.total}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-faint transition-transform ${
                        open ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {open && (
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
                        <button
                          onClick={() =>
                            setEditTarget({
                              orderId: m.orderId,
                              movementId: m.id,
                            })
                          }
                          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium active:bg-surface-2"
                        >
                          <Pencil size={14} /> Sửa
                        </button>
                        <Link
                          href={`/lsx/${m.orderId}`}
                          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted active:bg-surface-2"
                        >
                          Mở LSX
                        </Link>
                        <button
                          onClick={() => setDel(m)}
                          disabled={pending}
                          className="ml-auto flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-short active:bg-surface-2 disabled:opacity-50"
                        >
                          <Trash2 size={14} /> Xoá
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={del != null}
        onOpenChange={(v) => !v && setDel(null)}
        title="Xoá phiếu này?"
        description={`Phiếu ${del ? movementShort(del.type, del.stageName) : ""} của ${del?.orderCode ?? ""}. Số liệu đã gửi/còn thiếu sẽ được tính lại.`}
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
