"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChevronRight,
  PackagePlus,
  Palette,
  Factory,
  CalendarDays,
  SearchX,
} from "lucide-react";
import ProgressBar from "@/components/ProgressBar";
import type { OrderSummary } from "@/lib/aggregate";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function OrderList({
  orders,
  searching,
}: {
  orders: OrderSummary[];
  searching?: boolean;
}) {
  if (orders.length === 0) {
    return (
      <div className="mt-20 flex flex-col items-center text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface text-faint">
          {searching ? <SearchX size={30} /> : <PackagePlus size={30} />}
        </span>
        {searching ? (
          <p className="text-muted">Không tìm thấy lệnh sản xuất nào.</p>
        ) : (
          <>
            <p className="text-muted">Chưa có lệnh sản xuất nào.</p>
            <Link
              href="/lsx/new"
              className="mt-5 rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-fg"
            >
              + Tạo LSX đầu tiên
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <ul className="space-y-3 pb-4">
      {orders.map((o, i) => (
        <motion.li
          key={o.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.05, 0.3), ease: [0.16, 1, 0.3, 1] }}
        >
          <Link
            href={`/lsx/${o.id}`}
            className="panel block rounded-[var(--radius-card)] p-4 transition-colors active:border-brand-line"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="nums font-bold text-brand">{o.code}</span>
                  {o.status === "DONE" ? (
                    <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
                      Hoàn thành
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-faint">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_6px_var(--color-brand)]" />
                      Đang chạy
                    </span>
                  )}
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-ink">
                  <Palette size={13} className="shrink-0 text-faint" />
                  {o.productName}
                </p>
              </div>
              <ChevronRight size={18} className="mt-1 shrink-0 text-faint" />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1">
                <Factory size={12} />
                {o.lineName ?? "chưa gán chuyền"}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays size={12} />
                <span className="nums">{formatDate(o.createdAt)}</span>
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <ProgressBar
                label="Chi tiết xuất"
                done={o.progress.detailDone}
                target={o.progress.detailTarget}
              />
              <ProgressBar
                label="Đã may"
                done={o.progress.sewnDone}
                target={o.progress.sewnTarget}
              />
            </div>

            {o.progress.atEmbroidery > 0 && (
              <div className="mt-3">
                <span className="nums rounded-md bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                  Ở thêu: {o.progress.atEmbroidery}
                </span>
              </div>
            )}
          </Link>
        </motion.li>
      ))}
    </ul>
  );
}
