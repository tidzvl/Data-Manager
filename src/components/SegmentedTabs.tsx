"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { motion } from "framer-motion";

export default function SegmentedTabs({
  param = "tab",
  tabs,
}: {
  param?: string;
  tabs: { key: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(param) ?? tabs[0].key;

  const go = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(param, key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div className="flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {tabs.map((t) => {
        const active = current === t.key;
        return (
          <button
            key={t.key}
            onClick={() => go(t.key)}
            className={`relative flex-1 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              active ? "text-brand-fg" : "text-muted"
            }`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${param}`}
                transition={{ type: "spring", stiffness: 450, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-brand"
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
