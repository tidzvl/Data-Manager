"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ClipboardList, ScrollText, Settings } from "lucide-react";

const items = [
  { href: "/", label: "LSX", Icon: ClipboardList },
  { href: "/journal", label: "Nhật ký", Icon: ScrollText },
  { href: "/settings", label: "Cài đặt", Icon: Settings },
];

export default function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/80 backdrop-blur-xl pb-safe lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-3">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`tap relative flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-brand" : "text-faint"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand"
                  style={{ boxShadow: "0 0 12px var(--color-brand)" }}
                />
              )}
              <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
