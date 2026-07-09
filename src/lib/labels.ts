import type { MovementType } from "@prisma/client";

/**
 * Luồng sản xuất:
 * SEW_OUT → SEW_IN → EMB_OUT → EMB_IN
 * (xuất chi tiết) → (chuyền trả hàng đã may) → (gửi hàng đã may đi thêu) → (nhận thêu về)
 */
export const MOVEMENT_LABELS: Record<MovementType, string> = {
  SEW_OUT: "Xuất chi tiết → chuyền may",
  SEW_IN: "Chuyền gửi hàng đã may",
  EMB_OUT: "Gửi hàng đã may đi thêu",
  EMB_IN: "Nhận hàng thêu về",
};

export const MOVEMENT_SHORT: Record<MovementType, string> = {
  SEW_OUT: "Xuất chi tiết",
  SEW_IN: "Đã may",
  EMB_OUT: "Gửi thêu",
  EMB_IN: "Nhận thêu",
};

export const MOVEMENT_ACCENT: Record<MovementType, string> = {
  SEW_OUT: "text-brand bg-brand-soft",
  SEW_IN: "text-ok bg-ok-soft",
  EMB_OUT: "text-warn bg-warn-soft",
  EMB_IN: "text-ok bg-ok-soft",
};

export const MOVEMENT_TYPES: MovementType[] = [
  "SEW_OUT",
  "SEW_IN",
  "EMB_OUT",
  "EMB_IN",
];

/** Chỉ phiếu xuất chi tiết mới ghi theo từng chi tiết; còn lại ghi theo size. */
export function isPartLevel(type: MovementType): boolean {
  return type === "SEW_OUT";
}
