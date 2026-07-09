"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Plus,
  Factory,
} from "lucide-react";
import type { OrderNavItem } from "@/lib/aggregate";
import OrderFormModal from "@/components/forms/OrderFormModal";

const RAIL_COOKIE = "dm-rail";
const W_OPEN = "17rem";
const W_CLOSED = "3.25rem";

export default function OrderRail({
  orders,
  initialCollapsed,
}: {
  orders: OrderNavItem[];
  initialCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [q, setQ] = useState("");
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const pathname = usePathname();

  const activeId = useMemo(() => {
    const m = /^\/lsx\/(\d+)/.exec(pathname);
    return m ? Number(m[1]) : null;
  }, [pathname]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    // Lưu để lần tải sau render đúng ngay từ server, không nháy
    document.cookie = `${RAIL_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  };

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return orders;
    return orders.filter(
      (o) =>
        o.code.toLowerCase().includes(n) ||
        o.productName.toLowerCase().includes(n) ||
        (o.lineName ?? "").toLowerCase().includes(n)
    );
  }, [orders, q]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? W_CLOSED : W_OPEN }}
      transition={{ type: "spring", stiffness: 400, damping: 38 }}
      className="sticky top-[var(--topbar-h)] hidden h-[calc(100dvh-var(--topbar-h))] shrink-0 flex-col border-r border-line bg-surface lg:flex"
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 py-3">
          <button
            onClick={toggle}
            aria-label="Mở danh sách lệnh sản xuất"
            title="Mở danh sách LSX"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <PanelLeftOpen size={18} />
          </button>
          <button
            onClick={() => setNewOrderOpen(true)}
            aria-label="Tạo LSX"
            title="Tạo LSX"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-brand transition-colors hover:bg-brand-soft"
          >
            <Plus size={18} />
          </button>
          <span className="mt-1 h-px w-6 bg-line" />
          <span className="nums text-[10px] text-faint">{orders.length}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-1 px-3 pt-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-faint">
              Lệnh sản xuất
            </span>
            <button
              onClick={toggle}
              aria-label="Thu gọn danh sách"
              title="Thu gọn"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftClose size={17} />
            </button>
          </div>

          <div className="px-3 pb-2 pt-2">
            <div className="relative">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Lọc nhanh…"
                className="w-full rounded-lg border border-line bg-surface-2 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-brand-line"
              />
            </div>
          </div>

          <nav className="thin-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted">
                Không có LSX nào khớp.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((o) => {
                  const active = o.id === activeId;
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/lsx/${o.id}`}
                        className={`relative flex flex-col gap-0.5 rounded-lg px-2.5 py-2 transition-colors ${
                          active
                            ? "bg-brand-soft"
                            : "hover:bg-surface-2"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="rail-active"
                            transition={{
                              type: "spring",
                              stiffness: 450,
                              damping: 34,
                            }}
                            className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand"
                          />
                        )}
                        <span className="flex items-center gap-1.5">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                              o.status === "DONE"
                                ? "bg-ok"
                                : "bg-brand shadow-[0_0_5px_var(--color-brand)]"
                            }`}
                          />
                          <span
                            className={`nums truncate text-xs font-semibold ${
                              active ? "text-brand" : "text-ink"
                            }`}
                          >
                            {o.code}
                          </span>
                        </span>
                        <span className="truncate pl-3 text-[11px] text-muted">
                          {o.productName}
                        </span>
                        {o.lineName && (
                          <span className="flex items-center gap-1 truncate pl-3 text-[10px] text-faint">
                            <Factory size={9} />
                            {o.lineName}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          <div className="border-t border-line p-2">
            <button
              onClick={() => setNewOrderOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2 text-xs font-medium text-muted transition-colors hover:border-[var(--color-brand-line)] hover:text-brand"
            >
              <Plus size={14} /> Tạo LSX
            </button>
          </div>
        </>
      )}

      <OrderFormModal
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        gotoAfterCreate
      />
    </motion.aside>
  );
}
