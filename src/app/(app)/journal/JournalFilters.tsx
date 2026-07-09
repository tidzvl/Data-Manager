"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import type { MovementType } from "@prisma/client";
import { MOVEMENT_SHORT, MOVEMENT_TYPES } from "@/lib/labels";

export default function JournalFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const qParam = params.get("q") ?? "";
  const tParam = params.get("t") ?? "";
  const dParam = params.get("d") ?? "";
  const [q, setQ] = useState(qParam);

  useEffect(() => setQ(qParam), [qParam]);

  /** Cập nhật query; mọi thay đổi bộ lọc đều đưa về trang 1. */
  const push = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // Debounce ô tìm kiếm
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q === qParam) return;
      push({ q: q.trim() || undefined });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilter = qParam !== "" || tParam !== "" || dParam !== "";

  return (
    <div className="space-y-2.5 lg:flex lg:items-center lg:gap-3 lg:space-y-0">
      <div className="flex gap-2 lg:shrink-0">
        <div className="relative min-w-0 flex-1 lg:w-80 lg:flex-none">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm mã LSX, chuyền, chi tiết…"
            className="tap w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-line"
          />
        </div>
        <input
          type="date"
          value={dParam}
          onChange={(e) => push({ d: e.target.value || undefined })}
          aria-label="Lọc theo ngày"
          className="tap nums shrink-0 rounded-xl border border-line bg-surface px-2 text-sm outline-none focus:border-brand-line"
        />
      </div>

      <div className="xscroll -mx-4 px-4 lg:mx-0 lg:px-0">
        <div className="flex gap-1.5">
          <Chip active={!tParam} onClick={() => push({ t: undefined })}>
            Tất cả
          </Chip>
          {MOVEMENT_TYPES.map((t) => (
            <Chip
              key={t}
              active={tParam === t}
              onClick={() => push({ t })}
            >
              {MOVEMENT_SHORT[t as MovementType]}
            </Chip>
          ))}
          {hasFilter && (
            <button
              onClick={() => push({ q: undefined, t: undefined, d: undefined })}
              className="flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-sm text-muted active:bg-surface-2"
            >
              <X size={14} /> Xoá lọc
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-brand text-brand-fg"
          : "border border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}
