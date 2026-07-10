/** Tuỳ chỉnh hiển thị của khối kính — lưu ở localStorage, không đụng tới DB. */

export type GlassPrefs = {
  /** px, 0–50 */
  blur: number;
  /** 0–0.9 */
  opacity: number;
  /** RGB triple, vd "38,28,64" */
  tint: string;
  /** 0–0.7, độ tối của lớp phủ nền */
  scrim: number;
  /** dataURL ảnh người dùng tải lên; null = dùng ảnh mặc định */
  bgUrl: string | null;
  /** % chiều rộng khối kính; 100 = kín bề ngang trang (40–100) */
  widthPct: number;
  /** % chiều cao khối kính; 100 = kín bề dọc trang (40–100) */
  heightPct: number;
};

/** Lề giữa khối kính và mép màn hình, tính cả hai bên. */
export const PANEL_INSET = 96;
export const PANEL_MIN_PCT = 40;

export const GLASS_KEY = "dm-glass";

export const GLASS_DEFAULTS: GlassPrefs = {
  blur: 22,
  opacity: 0.42,
  tint: "38,28,64",
  scrim: 0,
  bgUrl: null,
  widthPct: 100,
  heightPct: 100,
};

export const TINT_OPTIONS = ["38,28,64", "20,20,30", "30,40,70", "60,30,55"];

export function readGlassPrefs(): GlassPrefs {
  if (typeof window === "undefined") return GLASS_DEFAULTS;
  try {
    const raw = localStorage.getItem(GLASS_KEY);
    if (!raw) return GLASS_DEFAULTS;
    const saved = JSON.parse(raw) as Partial<GlassPrefs>;
    return { ...GLASS_DEFAULTS, ...saved };
  } catch {
    return GLASS_DEFAULTS;
  }
}

export function writeGlassPrefs(prefs: GlassPrefs) {
  try {
    localStorage.setItem(GLASS_KEY, JSON.stringify(prefs));
  } catch {
    // Ảnh nền dataURL có thể vượt hạn mức localStorage (~5MB). Không lưu được
    // thì vẫn giữ nguyên trong state cho phiên hiện tại.
    try {
      localStorage.setItem(
        GLASS_KEY,
        JSON.stringify({ ...prefs, bgUrl: null })
      );
    } catch {
      /* bỏ qua */
    }
  }
}
