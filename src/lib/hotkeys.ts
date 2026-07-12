"use client";

import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

/** Con trỏ đang nằm trong một ô nhập liệu — phím thuộc về nó, không phải về bảng. */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable === true
  );
}

/**
 * Có modal (Radix Dialog) đang mở. Đọc thẳng DOM thay vì dựng thêm một context
 * đếm modal: mọi modal của app đều là Radix, và cây modal nằm ở portal ngoài
 * tầm với của mọi provider trong bảng.
 */
export function isModalOpen(): boolean {
  return !!document.querySelector('[role="dialog"][data-state="open"]');
}

/** Phím đơn (n, i, e, x, /, ?) chỉ tính khi không kèm phím bổ trợ nào. */
export function isPlainKey(e: KeyboardEvent): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * Bộ gõ tiếng Việt (Unikey, IME của Windows) đang soạn dở một chữ có dấu.
 *
 * Lúc ấy phím thuộc về BỘ GÕ, không thuộc về ta: Enter là phím nó dùng để CHỐT
 * dấu, mũi tên là phím nó dùng để đi trong chữ đang soạn. Cướp mấy phím đó thì
 * người dùng gõ "đợt" mà dấu bay mất — và với Enter thì còn lưu luôn cả dòng.
 *
 * `keyCode === 229` là mã "đang soạn" của các trình duyệt cũ; `isComposing`
 * mới là đường chính. Hỏi cả hai cho chắc.
 */
export function isComposing(e: ReactKeyboardEvent | KeyboardEvent): boolean {
  const n = "nativeEvent" in e ? e.nativeEvent : e;
  return n.isComposing || n.keyCode === 229;
}

/**
 * Nghe phím ở tầng document, sau khi đã lọc:
 * - Có modal mở → nhường hết cho modal (kể cả Escape: Radix tự đóng).
 * - Đang gõ trong input → nhường cho input. Escape thì blur ra, vì input tự
 *   xử Escape trước (React gắn listener ở gốc cây, chạy trước document).
 * - Đã có ai đó `preventDefault` → coi như đã xử lý xong.
 *
 * Handler để trong ref nên listener chỉ gắn một lần; không thì mỗi lần con trỏ
 * đổi ô là gỡ/gắn lại listener.
 */
export function useHotkeys(handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || isModalOpen()) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      ref.current(e);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);
}
