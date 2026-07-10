"use server";

import { requireSession } from "@/lib/auth";
import { getGridExport, getGridRowsByStages, type GridFilters } from "@/lib/grid";
import { buildGridWorkbook } from "@/lib/export-xlsx";

export type ExportRequest =
  /** Đúng các dòng người dùng đã tick. */
  | { mode: "selected"; stageIds: number[] }
  /** Mọi dòng khớp bộ lọc hiện tại, không giới hạn trang. */
  | { mode: "filtered"; filters: GridFilters };

export type ExportResult =
  | { ok: true; fileName: string; base64: string; rows: number }
  | { ok: false; error: string };

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Dựng file xlsx ở server rồi trả về base64 — server action không trả được
 * Blob/Stream, và dữ liệu cần cho "mọi trang" chỉ có ở server.
 */
export async function exportGridXlsx(
  req: ExportRequest
): Promise<ExportResult> {
  await requireSession();
  try {
    const { columns, rows } =
      req.mode === "selected"
        ? await getGridRowsByStages(req.stageIds)
        : await getGridExport(req.filters);

    if (rows.length === 0)
      return { ok: false, error: "Không có dòng nào để xuất." };

    const exportedAt = new Date();
    const scope =
      req.mode === "selected"
        ? `${rows.length} dòng được chọn`
        : describeFilters(req.filters, rows.length);

    const buf = await buildGridWorkbook(columns, rows, { scope, exportedAt });

    return {
      ok: true,
      fileName: `LSX-${stamp(exportedAt)}.xlsx`,
      base64: buf.toString("base64"),
      rows: rows.length,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Lỗi khi xuất file.",
    };
  }
}

function describeFilters(f: GridFilters, count: number): string {
  const bits = [
    f.q ? `tìm "${f.q}"` : null,
    f.day ? `ngày ${f.day}` : null,
    f.muc ? `mục ${f.muc}` : null,
  ].filter(Boolean);
  const where = bits.length ? bits.join(", ") : "không lọc";
  return `Toàn bộ dòng khớp bộ lọc (${where}) — ${count} dòng`;
}
