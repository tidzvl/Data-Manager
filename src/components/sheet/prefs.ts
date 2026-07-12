/** Tuỳ chỉnh hiển thị của bảng LSX — lưu ở localStorage, không đụng tới DB. */

export type SheetPrefs = {
  /** Màu nhấn: thanh tiêu đề, header bảng, nút chính. */
  accent: string;
  /** Đệm ô hẹp lại, xem được nhiều dòng hơn trong một màn. */
  compact: boolean;
  /** Tô nền xen kẽ theo tầng cho dễ dò dòng. */
  banded: boolean;
};

export const SHEET_KEY = "dm-sheet";

export const SHEET_DEFAULTS: SheetPrefs = {
  accent: "#217346",
  compact: false,
  banded: true,
};

/** Các tông đã cân với bảng màu còn lại (cam kế hoạch / xanh đã nhận). */
export const ACCENT_OPTIONS: { value: string; label: string }[] = [
  { value: "#217346", label: "Xanh Excel" },
  { value: "#375623", label: "Xanh rêu" },
  { value: "#1f6feb", label: "Xanh dương" },
  { value: "#7e22ce", label: "Tím" },
  { value: "#9a3412", label: "Nâu đỏ" },
];

export function readSheetPrefs(): SheetPrefs {
  if (typeof window === "undefined") return SHEET_DEFAULTS;
  try {
    const raw = localStorage.getItem(SHEET_KEY);
    if (!raw) return SHEET_DEFAULTS;
    return { ...SHEET_DEFAULTS, ...(JSON.parse(raw) as Partial<SheetPrefs>) };
  } catch {
    return SHEET_DEFAULTS;
  }
}

export function writeSheetPrefs(prefs: SheetPrefs) {
  try {
    localStorage.setItem(SHEET_KEY, JSON.stringify(prefs));
  } catch {
    /* hết hạn mức localStorage — vẫn giữ trong state cho phiên hiện tại */
  }
}
