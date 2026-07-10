"use client";

import { LogOut, SlidersHorizontal, Upload } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import {
  GLASS_DEFAULTS,
  PANEL_MIN_PCT,
  TINT_OPTIONS,
  type GlassPrefs,
} from "./prefs";

/** Popover của nút bánh răng: tinh chỉnh nền + khối kính, và lối vào cài đặt. */
export default function GlassSettings({
  prefs,
  onChange,
  onPickFile,
  onOpenSystem,
}: {
  prefs: GlassPrefs;
  onChange: (p: GlassPrefs) => void;
  onPickFile: (f: File) => void;
  onOpenSystem: () => void;
}) {
  const set = <K extends keyof GlassPrefs>(key: K, value: GlassPrefs[K]) =>
    onChange({ ...prefs, [key]: value });

  return (
    <div
      style={{
        position: "absolute",
        top: 50,
        right: 0,
        zIndex: 20,
        width: 288,
        background: "rgba(28,20,48,0.97)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        border: "1px solid var(--g-line-4)",
        borderRadius: 16,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        padding: "18px 18px 20px",
        maxHeight: "calc(100vh - 170px)",
        overflowY: "auto",
      }}
    >
      <div className="mb-[14px] flex items-center justify-between">
        <span style={{ fontSize: 15, fontWeight: 600 }}>Tùy chỉnh giao diện</span>
        <button
          onClick={() => onChange(GLASS_DEFAULTS)}
          style={{
            background: "var(--g-fill)",
            border: "1px solid var(--g-line-3)",
            color: "rgba(255,255,255,0.8)",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          Đặt lại
        </button>
      </div>

      <SectionLabel>Nền</SectionLabel>
      <label
        className="mb-3 flex cursor-pointer items-center justify-center gap-2"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px dashed rgba(255,255,255,0.2)",
          borderRadius: 10,
          padding: 9,
          fontSize: 13,
        }}
      >
        <Upload size={14} />
        <span>Tải ảnh nền (PNG)</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = "";
          }}
        />
      </label>

      <Slider
        label="Làm tối nền"
        display={`${Math.round(prefs.scrim * 100)}%`}
        min={0}
        max={0.7}
        step={0.02}
        value={prefs.scrim}
        onChange={(v) => set("scrim", v)}
      />

      <div className="mt-4">
        <SectionLabel>Kích thước khối</SectionLabel>
      </div>
      <Slider
        label="Chiều rộng"
        display={`${prefs.widthPct}%`}
        min={PANEL_MIN_PCT}
        max={100}
        step={1}
        value={prefs.widthPct}
        onChange={(v) => set("widthPct", v)}
      />
      <Slider
        label="Chiều cao"
        display={`${prefs.heightPct}%`}
        min={PANEL_MIN_PCT}
        max={100}
        step={1}
        value={prefs.heightPct}
        onChange={(v) => set("heightPct", v)}
      />

      <div className="mt-4">
        <SectionLabel>Khối kính</SectionLabel>
      </div>
      <Slider
        label="Độ mờ"
        display={`${prefs.blur}px`}
        min={0}
        max={50}
        step={1}
        value={prefs.blur}
        onChange={(v) => set("blur", v)}
      />
      <Slider
        label="Độ trong"
        display={`${Math.round(prefs.opacity * 100)}%`}
        min={0}
        max={0.9}
        step={0.02}
        value={prefs.opacity}
        onChange={(v) => set("opacity", v)}
      />

      <div style={{ fontSize: 12, color: "var(--g-text-2)", margin: "10px 0 8px" }}>
        Tông màu kính
      </div>
      <div className="flex gap-[10px]">
        {TINT_OPTIONS.map((t) => (
          <button
            key={t}
            onClick={() => set("tint", t)}
            aria-label={`Tông ${t}`}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              cursor: "pointer",
              background: `rgb(${t})`,
              border:
                t === prefs.tint
                  ? "2px solid #fff"
                  : "2px solid rgba(255,255,255,0.18)",
            }}
          />
        ))}
      </div>

      <div
        style={{
          borderTop: "1px solid var(--g-line-3)",
          margin: "16px 0 12px",
        }}
      />

      <button onClick={onOpenSystem} style={linkBtn}>
        <SlidersHorizontal size={14} />
        Chuyền may, danh mục, mật khẩu
      </button>

      <form action={logoutAction}>
        <button
          type="submit"
          style={{ ...linkBtn, color: "#ff9d7a", marginTop: 6 }}
        >
          <LogOut size={14} />
          Đăng xuất
        </button>
      </form>
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  background: "var(--g-fill)",
  border: "1px solid var(--g-line-3)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12.5,
  cursor: "pointer",
  textAlign: "left",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: ".5px",
        color: "rgba(255,255,255,0.45)",
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function Slider({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  display: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <>
      <div
        className="flex items-center justify-between"
        style={{ fontSize: 12, color: "var(--g-text-2)", marginBottom: 5 }}
      >
        <span>{label}</span>
        <span>{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", marginBottom: 12 }}
      />
    </>
  );
}
