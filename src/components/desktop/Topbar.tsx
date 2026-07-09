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

export default function Topbar({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-30 hidden h-[var(--topbar-h)] border-b border-line bg-surface/85 backdrop-blur-xl lg:block">
      <div className="mx-auto flex h-full max-w-[1800px] items-center gap-6 px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-xs font-bold text-brand-fg">
            LSX
          </span>
          <span className="text-sm font-bold tracking-tight">
            Quản lý sản xuất
          </span>
        </Link>

        <nav className="flex h-full items-stretch gap-1">
          {items.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2 px-3 text-sm font-medium transition-colors ${
                  active ? "text-brand" : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={16} />
                {label}
                {active && (
                  <motion.span
                    layoutId="topbar-active"
                    transition={{ type: "spring", stiffness: 450, damping: 34 }}
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-brand"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle variant="icon" />
          <span className="ml-1 hidden text-sm text-muted xl:inline">
            {userName}
          </span>
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
    </header>
  );
}
