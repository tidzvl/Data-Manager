/** Bảng màu gán cho chi tiết mới trong danh mục dùng chung. */
export const PART_PALETTE = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#64748b",
  "#06b6d4",
  "#84cc16",
  "#a855f7",
  "#0ea5e9",
];

/** Màu chưa dùng đầu tiên; hết màu thì quay vòng. */
export function pickPartColor(used: Set<string>, seq: number): string {
  return (
    PART_PALETTE.find((c) => !used.has(c)) ??
    PART_PALETTE[seq % PART_PALETTE.length]
  );
}
