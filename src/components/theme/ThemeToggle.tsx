"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import {
  type ThemePref,
  type Resolved,
  THEME_KEY,
  readPref,
  resolvePref,
  applyResolved,
} from "./theme";

const OPTIONS: { key: ThemePref; label: string; Icon: typeof Sun }[] = [
  { key: "light", label: "Sáng", Icon: Sun },
  { key: "dark", label: "Tối", Icon: Moon },
  { key: "system", label: "Tự động", Icon: MonitorSmartphone },
];

export default function ThemeToggle({
  variant = "segmented",
}: {
  variant?: "segmented" | "icon";
}) {
  const [pref, setPref] = useState<ThemePref>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setPref(readPref());
    setMounted(true);
  }, []);

  // Theo dõi thay đổi hệ thống khi đang ở chế độ "Tự động"
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyResolved(resolvePref("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const choose = (next: ThemePref) => {
    setPref(next);
    localStorage.setItem(THEME_KEY, next);
    applyResolved(resolvePref(next));
  };

  if (variant === "icon") {
    // Nút đơn: đảo Sáng <-> Tối theo trạng thái hiện tại
    const current: Resolved = mounted
      ? (document.documentElement.dataset.theme as Resolved) || "dark"
      : "dark";
    const next = current === "dark" ? "light" : "dark";
    return (
      <button
        onClick={() => choose(next)}
        aria-label={next === "light" ? "Chuyển nền sáng" : "Chuyển nền tối"}
        className="tap flex items-center justify-center rounded-lg border border-line bg-surface text-muted active:bg-surface-2"
      >
        {current === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    );
  }

  return (
    <div className="flex gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {OPTIONS.map((o) => {
        const active = pref === o.key;
        return (
          <button
            key={o.key}
            onClick={() => choose(o.key)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
              active ? "text-brand-fg" : "text-muted"
            }`}
          >
            {active && (
              <motion.span
                layoutId="theme-seg"
                transition={{ type: "spring", stiffness: 450, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-brand"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <o.Icon size={15} /> {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
