import type { MovementType } from "@prisma/client";

/**
 * Luồng sản xuất còn theo dõi: SEW_IN (nhận may) → EMB_IN (nhận thêu).
 * Các record dưới đây vẫn đủ 4 khoá vì enum trong DB giữ nguyên — chỉ 2 mục
 * trong MOVEMENT_TYPES là còn được hiển thị/tạo mới.
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

/**
 * Các mục còn dùng. "Gửi may"/"Gửi thêu" (SEW_OUT/EMB_OUT) đã bị khách bỏ:
 * phiếu cũ vẫn trong DB nhưng bị ẩn khỏi mọi danh sách và không tạo mới được.
 */
export const MOVEMENT_TYPES: MovementType[] = ["SEW_IN", "EMB_IN"];

/** Chỉ phiếu xuất chi tiết mới ghi theo từng chi tiết; còn lại ghi theo size. */
export function isPartLevel(type: MovementType): boolean {
  return type === "SEW_OUT";
}

/**
 * Nhãn của một đợt trong nhật ký / lịch sử.
 *
 * Đợt của mục tự do không thuộc công đoạn nào, nên nó không có nhãn dựng sẵn —
 * lấy tên của mục làm nhãn. Tra thẳng `MOVEMENT_SHORT[type]` với `type` null sẽ
 * ra `undefined` và huy hiệu hiện ra trống trơn.
 */
export function movementShort(
  type: MovementType | null,
  stageName?: string | null
): string {
  return type ? MOVEMENT_SHORT[type] : (stageName?.trim() || "Mục riêng");
}

/** Màu huy hiệu; mục tự do dùng tông trung tính vì nó không nằm trong luồng. */
export function movementAccent(type: MovementType | null): string {
  return type ? MOVEMENT_ACCENT[type] : "text-muted bg-surface-2";
}
