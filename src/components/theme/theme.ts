export type ThemePref = "light" | "dark" | "system";
export type Resolved = "light" | "dark";

export const THEME_KEY = "dm-theme";
export const THEME_COLORS: Record<Resolved, string> = {
  dark: "#0a0a0b",
  light: "#fdf6ea",
};

export function resolvePref(pref: ThemePref): Resolved {
  if (pref === "system") {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      return "light";
    }
    return "dark";
  }
  return pref;
}

export function readPref(): ThemePref {
  if (typeof window === "undefined") return "dark";
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "dark";
}

export function applyResolved(resolved: Resolved) {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[resolved]);
}
