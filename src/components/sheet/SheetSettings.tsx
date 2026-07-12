"use client";

import { Check, SlidersHorizontal } from "lucide-react";
import { ACCENT_OPTIONS, type SheetPrefs } from "./prefs";

/** Popover của nút bánh răng: tông màu, mật độ dòng, và lối vào cài đặt hệ thống. */
export default function SheetSettings({
  prefs,
  onChange,
  onOpenSystem,
}: {
  prefs: SheetPrefs;
  onChange: (p: SheetPrefs) => void;
  onOpenSystem: () => void;
}) {
  const set = <K extends keyof SheetPrefs>(key: K, value: SheetPrefs[K]) =>
    onChange({ ...prefs, [key]: value });

  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        right: 0,
        zIndex: 40,
        width: 232,
        padding: 12,
        background: "#fff",
        border: "1px solid var(--s-card-line)",
        borderRadius: 4,
        boxShadow: "0 14px 40px rgba(31,42,36,.22)",
      }}
    >
      <Label>Tông màu</Label>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {ACCENT_OPTIONS.map((a) => (
          <button
            key={a.value}
            title={a.label}
            onClick={() => set("accent", a.value)}
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: 3,
              background: a.value,
              border:
                prefs.accent === a.value
                  ? "2px solid var(--s-ink)"
                  : "1px solid var(--s-card-line)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
            }}
          >
            {prefs.accent === a.value && <Check size={13} />}
          </button>
        ))}
      </div>

      <Toggle
        label="Dòng gọn"
        hint="Đệm ô hẹp lại, xem được nhiều dòng hơn"
        on={prefs.compact}
        onChange={(v) => set("compact", v)}
      />
      <Toggle
        label="Tô nền xen kẽ"
        hint="Phân biệt tầng Mục / Đợt bằng nền"
        on={prefs.banded}
        onChange={(v) => set("banded", v)}
      />

      <button
        onClick={onOpenSystem}
        style={{
          marginTop: 10,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          padding: "7px 12px",
          background: "var(--s-bar)",
          border: "1px solid var(--s-card-line)",
          borderRadius: 4,
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        <SlidersHorizontal size={14} /> Cài đặt hệ thống
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginBottom: 6,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: ".4px",
        textTransform: "uppercase",
        color: "var(--s-muted)",
      }}
    >
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "6px 0",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 14,
          height: 14,
          marginTop: 2,
          flexShrink: 0,
          accentColor: "var(--s-accent)",
          cursor: "pointer",
        }}
      />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12.5 }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "var(--s-muted)" }}>
          {hint}
        </span>
      </span>
    </label>
  );
}
