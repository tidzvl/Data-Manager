"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion } from "framer-motion";

export default function DesktopTabs({
  tabs,
  current,
}: {
  tabs: { key: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("tab", key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const active = current === t.key;
        return (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              active ? "text-brand" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {active && (
              <motion.span
                layoutId="desktop-tab"
                transition={{ type: "spring", stiffness: 450, damping: 34 }}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
