"use client";

import { Minus, Plus } from "lucide-react";

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
  const clamp = (v: number) => (Number.isFinite(v) && v >= 0 ? v : 0);
  const over = max != null && value > max;
  const filled = value > 0;

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-xl border bg-surface-2 transition-colors ${
        filled ? "border-brand-line" : "border-line"
      }`}
    >
      <button
        type="button"
        aria-label="Giảm"
        onClick={() => onChange(clamp(value - 1))}
        className="tap flex w-10 items-center justify-center text-muted active:bg-surface"
      >
        <Minus size={16} />
      </button>
      <input
        name={name}
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel}
        value={value === 0 ? "" : String(value)}
        placeholder="0"
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
        aria-label="Tăng"
        onClick={() => onChange(clamp(value + 1))}
        className="tap flex w-10 items-center justify-center text-muted active:bg-surface"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
