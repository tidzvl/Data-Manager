// Kiểu và hằng số của bảng kính — dùng chung cho cả server lẫn client.
// Phần truy vấn DB nằm ở `grid.ts` (server-only), không import từ client.
import type { MovementType } from "@prisma/client";

export const MUC_TYPES: MovementType[] = [
  "SEW_OUT",
  "SEW_IN",
  "EMB_OUT",
  "EMB_IN",
];

export const MUC_LABEL: Record<MovementType, string> = {
  SEW_OUT: "Gửi may",
  SEW_IN: "Nhận may",
  EMB_OUT: "Gửi thêu",
  EMB_IN: "Nhận thêu",
};

/**
 * Nhãn hiển thị của một mục. `name` là nhãn ĐÈ LÊN nhãn mặc định của `type`,
 * nên mục hệ thống đổi tên được mà vẫn giữ nguyên vai trò của nó trong luồng.
 * Mục tự do không có `type`, nên `name` chính là tất cả những gì nó có.
 */
export function mucLabelOf(
  type: MovementType | null,
  name: string | null
): string {
  const custom = name?.trim();
  if (custom) return custom;
  return type ? MUC_LABEL[type] : "Mục mới";
}

/** Cột size: danh mục dùng chung, không phụ thuộc LSX. */
export type SizeColumn = { id: number; label: string };

/**
 * Ô số. `value` là số hiển thị; `done`/`target` chỉ để tô màu thiếu/đủ.
 * `orderSizeId` null nghĩa là phân loại này không khai báo size đó.
 *
 * Ở dòng mục, `value` = `done` = tổng các đợt, còn `target` = SL GỐC của LSX:
 * ô tự nói lên "đã gửi/nhận được bao nhiêu trên tổng phải làm".
 */
export type Cell = {
  orderSizeId: number | null;
  value: number;
  done: number;
  target: number;
};

/** Ô sửa được ghi vào đâu. */
export type EditKind = "target" | "item" | null;

export type GridChild = {
  key: string;
  label: string;
  /** Ngày của đợt (dd/mm). Dòng chi tiết không có ngày nên để rỗng. */
  dateLabel: string;
  /** yyyy-mm-dd để đổ vào input[type=date]; null ở dòng chi tiết. */
  dateIso: string | null;
  /** Ghi chú của phiếu; ở dòng chi tiết dùng để ghi "Định mức". */
  note: string | null;
  color: string | null;
  cells: Cell[];
  total: number;
  edit: EditKind;
  /** Có ở dòng chi tiết, và ở dòng đợt của SEW_OUT. */
  partId: number | null;
  /** Có ở dòng đợt. */
  movementId: number | null;
  /** Dòng chi tiết mở tiếp ra các đợt đã gửi. */
  batches?: GridChild[];
};

export type GridRow = {
  key: string;
  /** Bản ghi Stage — dòng này là một thực thể thật, không phải tổ hợp suy ra. */
  stageId: number;
  orderId: number;
  code: string;
  productName: string;
  lineName: string | null;
  categoryId: number;
  categoryName: string;
  /** null = mục tự do: không thuộc luồng sản xuất, chỉ có đợt và số lượng. */
  muc: MovementType | null;
  mucLabel: string;
  /** Các mục chưa có dòng nào của cùng (LSX × phân loại) — để nút "Thêm mục". */
  missingMucs: MovementType[];
  note: string | null;
  /** Ngày tạo LSX, dd/mm/yyyy. */
  createdAt: string;
  /** yyyy-mm-dd để đổ vào input[type=date]. */
  createdAtIso: string;
  cells: Cell[];
  total: number;
  children: GridChild[];
  /** Tiêu đề khối mở rộng. */
  childHeader: string;
};

/**
 * Tầng 1 của bảng — một LSX. Trước đây LSX chỉ là mấy cột lặp lại trên mỗi dòng
 * mục; giờ nó là một dòng thật, và các mục nằm bên trong nó.
 *
 * `plan` là SL DỰ KIẾN của cả LSX (tổng `OrderSize.targetQty` của mọi phân loại
 * theo từng nhãn size), chỉ đọc ở bảng — sửa trong form LSX. Vì thế ô của nó
 * không có `orderSizeId`: một cột size có thể gộp nhiều phân loại, không quy về
 * một bản ghi OrderSize nào cả.
 */
export type GridOrder = {
  key: string;
  orderId: number;
  code: string;
  productName: string;
  lineName: string | null;
  note: string | null;
  /** dd/mm/yyyy */
  createdAt: string;
  createdAtIso: string;
  plan: number[];
  planTotal: number;
  /** Các mục (LSX × phân loại × mục) thuộc LSX này. */
  rows: GridRow[];
};

export type GridPage = {
  columns: SizeColumn[];
  orders: GridOrder[];
  /** Số dòng mục đang hiện — cho chân bảng. */
  rowCount: number;
  /** Tổng số LSX khớp bộ lọc (phân trang theo LSX, không theo dòng). */
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

export const GRID_SORTS = ["createdAt", "code", "productName", "line"] as const;
export type GridSort = (typeof GRID_SORTS)[number];
