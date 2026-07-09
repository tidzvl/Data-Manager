// Key helpers dùng chung cho cả server & client (không import server-only).
export const ps = (partId: number, sizeId: number) => `${partId}:${sizeId}`;
export const sl = (sizeId: number, lineId: number | null) =>
  `${sizeId}:${lineId ?? 0}`;
