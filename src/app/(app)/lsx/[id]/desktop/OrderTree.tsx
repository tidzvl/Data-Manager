"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  Layers,
  Ruler,
  Shapes,
  Factory,
  ClipboardList,
} from "lucide-react";
import type { OrderDetail } from "@/lib/aggregate";
import { ps } from "@/lib/keys";
import { pct } from "@/components/ProgressBar";

/**
 * Cây cấu trúc: LSX → phân loại → { kích thước, chi tiết }.
 * Mỗi nhánh hiện tiến độ của chính nó nên nhìn là biết chỗ nào đang kẹt.
 */
export default function OrderTree({ detail }: { detail: OrderDetail }) {
  const total = detail.categories.reduce(
    (a, c) => {
      for (const s of c.sizes) {
        a.target += s.targetQty;
        a.done += detail.sewInBySize[s.id] ?? 0;
      }
      return a;
    },
    { done: 0, target: 0 }
  );

  return (
    <div className="thin-scroll max-h-[calc(100dvh-11rem)] overflow-auto rounded-[var(--radius-card)] border border-line bg-surface p-3">
      {/* Gốc: LSX */}
      <div className="mb-1 flex items-start gap-2.5 rounded-lg bg-brand-soft px-2.5 py-2 ring-1 ring-inset ring-[var(--color-brand-line)]">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-fg">
          <ClipboardList size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="nums truncate text-sm font-bold text-brand">
            {detail.code}
          </div>
          <div className="truncate text-xs text-muted">
            {detail.productName}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <Factory size={11} />
            <span className="truncate">
              {detail.lineName ?? "chưa gán chuyền"}
            </span>
          </div>
        </div>
        <Meter done={total.done} target={total.target} />
      </div>

      {detail.categories.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-muted">
          Chưa khai báo phân loại nào.
        </p>
      ) : (
        <div className="ml-3.5 border-l border-line pl-0">
          {detail.categories.map((c) => (
            <CategoryNode key={c.id} detail={detail} category={c} />
          ))}
        </div>
      )}
    </div>
  );
}

type Cat = OrderDetail["categories"][number];

function CategoryNode({
  detail,
  category,
}: {
  detail: OrderDetail;
  category: Cat;
}) {
  const [open, setOpen] = useState(true);

  const done = category.sizes.reduce(
    (a, s) => a + (detail.sewInBySize[s.id] ?? 0),
    0
  );
  const target = category.sizes.reduce((a, s) => a + s.targetQty, 0);

  return (
    <div>
      <Row
        open={open}
        onToggle={() => setOpen((v) => !v)}
        icon={<Layers size={14} className="text-brand" />}
        label={category.name}
        right={<Meter done={done} target={target} />}
        strong
      />

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-3.5 border-l border-line">
              <SizesGroup detail={detail} category={category} />
              <PartsGroup detail={detail} category={category} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SizesGroup({ detail, category }: { detail: OrderDetail; category: Cat }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Row
        open={open}
        onToggle={() => setOpen((v) => !v)}
        icon={<Ruler size={13} className="text-muted" />}
        label={`Kích thước (${category.sizes.length})`}
        muted
      />
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            <div className="ml-3.5 border-l border-line">
              {category.sizes.map((s) => {
                const done = detail.sewInBySize[s.id] ?? 0;
                const short = s.targetQty - done;
                return (
                  <Leaf key={s.id}>
                    <span className="nums w-16 shrink-0 font-semibold">
                      {s.sizeLabel}
                    </span>
                    <span className="nums flex-1 text-xs text-muted">
                      may {done}/{s.targetQty}
                    </span>
                    {short > 0 ? (
                      <span className="nums rounded bg-short-soft px-1.5 py-0.5 text-[11px] font-medium text-short">
                        −{short}
                      </span>
                    ) : (
                      <span className="rounded bg-ok-soft px-1.5 py-0.5 text-[11px] font-medium text-ok">
                        đủ
                      </span>
                    )}
                  </Leaf>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PartsGroup({ detail, category }: { detail: OrderDetail; category: Cat }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <Row
        open={open}
        onToggle={() => setOpen((v) => !v)}
        icon={<Shapes size={13} className="text-muted" />}
        label={`Chi tiết (${category.parts.length})`}
        muted
      />
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            <div className="ml-3.5 border-l border-line">
              {category.parts.map((p) => {
                let done = 0;
                let target = 0;
                for (const s of category.sizes) {
                  done += detail.sewOut[ps(p.id, s.id)] ?? 0;
                  target += p.targets[s.id] ?? 0;
                }
                const short = target - done;
                return (
                  <Leaf key={p.id}>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: p.color ?? "var(--color-faint)" }}
                    />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="nums shrink-0 text-xs text-muted">
                      {done}/{target}
                    </span>
                    {short > 0 ? (
                      <span className="nums shrink-0 rounded bg-short-soft px-1.5 py-0.5 text-[11px] font-medium text-short">
                        −{short}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-ok-soft px-1.5 py-0.5 text-[11px] font-medium text-ok">
                        đủ
                      </span>
                    )}
                  </Leaf>
                );
              })}
              {category.parts.length === 0 && (
                <Leaf>
                  <span className="text-xs text-faint">Chưa có chi tiết</span>
                </Leaf>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Một nhánh có thể mở/đóng. */
function Row({
  open,
  onToggle,
  icon,
  label,
  right,
  strong,
  muted,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="relative flex items-center">
      <span className="h-px w-3 shrink-0 bg-line" />
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2"
      >
        <ChevronRight
          size={13}
          className={`shrink-0 text-faint transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
        {icon}
        <span
          className={`min-w-0 flex-1 truncate ${
            strong ? "text-sm font-semibold" : "text-xs"
          } ${muted ? "text-muted" : ""}`}
        >
          {label}
        </span>
        {right}
      </button>
    </div>
  );
}

/** Nút lá, không mở được. */
function Leaf({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex items-center">
      <span className="h-px w-3 shrink-0 bg-line" />
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-xs transition-colors hover:bg-surface-2">
        {children}
      </div>
    </div>
  );
}

function Meter({ done, target }: { done: number; target: number }) {
  const p = pct(done, target);
  const complete = target > 0 && done >= target;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div className="h-1 w-12 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${p}%`,
            background: complete ? "var(--color-ok)" : "var(--color-brand)",
          }}
        />
      </div>
      <span className="nums w-8 text-right text-[11px] text-muted">{p}%</span>
    </div>
  );
}
