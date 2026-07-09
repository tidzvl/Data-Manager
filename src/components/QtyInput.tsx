"use client";

import { useRef } from "react";
import { Minus, Plus } from "lucide-react";

/**
 * Ô nhập số lượng.
 *
 * Điều hướng bàn phím: mũi tên ←/→ nhảy sang ô size trước/kế trong cùng
 * `[data-qty-group]`, nhưng chỉ khi con trỏ đã ở đầu/cuối ô — nếu không thì
 * để mặc định di chuyển con trỏ trong số đang gõ. Enter luôn nhảy sang ô kế.
 * Ô được nhảy tới sẽ bôi đen sẵn để gõ đè.
 */
export default function QtyInput({
  name,
  value,
  onChange,
  max,
  ariaLabel,
}: {
  name?: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const clamp = (v: number) => (Number.isFinite(v) && v >= 0 ? v : 0);
  const over = max != null && value > max;
  const filled = value > 0;

  /** Chuyển focus sang ô kề (dir = 1 kế, -1 trước). Trả về true nếu chuyển được. */
  const focusSibling = (dir: 1 | -1): boolean => {
    const el = ref.current;
    const group = el?.closest("[data-qty-group]");
    if (!el || !group) return false;

    const items = Array.from(
      group.querySelectorAll<HTMLInputElement>("input[data-qty]")
    );
    const next = items[items.indexOf(el) + dir];
    if (!next) return false;

    next.focus();
    next.select();
    return true;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    const collapsed = el.selectionStart === el.selectionEnd;

    if (e.key === "Enter") {
      if (focusSibling(1)) e.preventDefault();
      return;
    }
    if (e.key === "ArrowRight" && collapsed && el.selectionStart === el.value.length) {
      if (focusSibling(1)) e.preventDefault();
      return;
    }
    if (e.key === "ArrowLeft" && collapsed && el.selectionStart === 0) {
      if (focusSibling(-1)) e.preventDefault();
    }
  };

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-xl border bg-surface-2 transition-colors ${
        filled ? "border-brand-line" : "border-line"
      }`}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Giảm"
        onClick={() => onChange(clamp(value - 1))}
        className="tap flex w-10 items-center justify-center text-muted active:bg-surface"
      >
        <Minus size={16} />
      </button>
      <input
        ref={ref}
        data-qty=""
        name={name}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        value={value === 0 ? "" : String(value)}
        placeholder="0"
        onKeyDown={onKeyDown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "");
          onChange(digits === "" ? 0 : clamp(parseInt(digits, 10)));
        }}
        className={`nums w-12 border-x border-line bg-transparent text-center text-base font-semibold outline-none ${
          over ? "text-short" : filled ? "text-brand" : "text-ink"
        }`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Tăng"
        onClick={() => onChange(clamp(value + 1))}
        className="tap flex w-10 items-center justify-center text-muted active:bg-surface"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
