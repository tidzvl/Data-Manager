"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ClipboardList, ScrollText, Settings, LogOut } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { logoutAction } from "@/app/actions/auth";

const items = [
  { href: "/", label: "Lệnh sản xuất", Icon: ClipboardList },
  { href: "/journal", label: "Nhật ký", Icon: ScrollText },
  { href: "/settings", label: "Cài đặt", Icon: Settings },
];

export default function Sidebar({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface lg:flex">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-fg">
          LSX
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight">
            Quản lý sản xuất
          </div>
          <div className="truncate text-xs text-faint">Xưởng may</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "text-brand"
                  : "text-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-0 rounded-lg bg-brand-soft ring-1 ring-inset ring-[var(--color-brand-line)]"
                />
              )}
              <Icon size={18} className="relative z-10 shrink-0" />
              <span className="relative z-10">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        <ThemeToggle />
        <div className="flex items-center gap-2 px-1">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-faint">Đăng nhập</div>
            <div className="truncate text-sm font-medium">
              {userName ?? "—"}
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              aria-label="Đăng xuất"
              title="Đăng xuất"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-[var(--color-short)] hover:text-short"
            >
              <LogOut size={16} />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
