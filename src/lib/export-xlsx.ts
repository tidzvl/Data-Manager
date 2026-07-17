import "server-only";
import ExcelJS from "exceljs";
import type { GridChild, GridRow, SizeColumn } from "./grid-types";

/**
 * Xuất bảng LSX ra một sheet phẳng.
 *
 * Mỗi dòng cha kéo theo các dòng con của nó, thụt vào ở cột "Nội dung" — giống
 * như khi bung hết bảng. Cột "Loại" cho biết con số ở dòng đó nghĩa là gì, vì
 * chúng khác nhau: dòng Mục là SL kế hoạch, dòng Chi tiết là định mức, dòng Đợt
 * là số đã gửi/nhận thật.
 */

const HEAD_FILL = "FF2A1D4A";
const SUB_FILL = "FFF3F0FA";

type RowKind = "Mục" | "Chi tiết" | "Đợt";

function sumDone(row: GridRow): number {
  return row.cells.reduce((a, c) => a + c.done, 0);
}

export async function buildGridWorkbook(
  columns: SizeColumn[],
  rows: GridRow[],
  meta: { scope: string; exportedAt: Date }
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = meta.exportedAt;
  const ws = wb.addWorksheet("Lệnh sản xuất", {
    views: [{ state: "frozen", xSplit: 7, ySplit: 1 }],
  });

  ws.columns = [
    { header: "Loại", key: "kind", width: 10 },
    { header: "LSX", key: "code", width: 15 },
    { header: "Sản phẩm", key: "product", width: 28 },
    { header: "Chuyền may", key: "line", width: 16 },
    { header: "Phân loại", key: "category", width: 11 },
    { header: "Mục", key: "muc", width: 12 },
    { header: "Nội dung", key: "label", width: 24 },
    ...columns.map((c) => ({ header: c.label, key: `s${c.id}`, width: 8 })),
    { header: "Tổng", key: "total", width: 9 },
    { header: "Thực tế", key: "done", width: 9 },
    { header: "Ngày", key: "date", width: 12 },
    { header: "Ghi chú", key: "note", width: 26 },
  ];

  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
  head.alignment = { vertical: "middle", horizontal: "center" };
  head.height = 20;

  for (const row of rows) {
    addRow(ws, columns, {
      kind: "Mục",
      code: row.code,
      product: row.productName,
      line: row.lineName ?? "",
      category: row.categoryName,
      muc: row.mucLabel,
      label: "",
      cells: row.cells,
      total: row.total,
      done: sumDone(row),
      date: row.createdAt,
      note: row.note ?? "",
      indent: 0,
      bold: true,
    });

    for (const child of row.children) {
      const isPart = child.movementId == null;
      addChild(ws, columns, row, child, isPart ? "Chi tiết" : "Đợt", 1);
      // Chi tiết của "Gửi may" còn có các đợt đã gửi của riêng nó.
      for (const batch of child.batches ?? [])
        addChild(ws, columns, row, batch, "Đợt", 2);
    }
  }

  // Lọc được ngay trong Excel, trừ dòng tiêu đề.
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

  const info = wb.addWorksheet("Thông tin");
  info.columns = [{ width: 18 }, { width: 60 }];
  info.addRows([
    ["Xuất lúc", meta.exportedAt.toLocaleString("vi-VN")],
    ["Phạm vi", meta.scope],
    ["Số dòng mục", rows.length],
    ["Ghi chú", "Dòng Mục = SL kế hoạch. Dòng Đợt = SL đã nhận thật."],
  ]);
  info.getColumn(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function addChild(
  ws: ExcelJS.Worksheet,
  columns: SizeColumn[],
  parent: GridRow,
  child: GridChild,
  kind: RowKind,
  indent: number
) {
  addRow(ws, columns, {
    kind,
    code: parent.code,
    product: "",
    line: "",
    category: parent.categoryName,
    muc: parent.mucLabel,
    label: child.label,
    cells: child.cells,
    total: child.total,
    // Dòng con không có khái niệm "thực tế / kế hoạch" riêng.
    done: null,
    date: child.dateLabel,
    note: child.note ?? "",
    indent,
    bold: false,
  });
}

type RowInput = {
  kind: RowKind;
  code: string;
  product: string;
  line: string;
  category: string;
  muc: string;
  label: string;
  cells: { value: number; orderSizeId: number | null }[];
  total: number;
  done: number | null;
  date: string;
  note: string;
  indent: number;
  bold: boolean;
};

function addRow(ws: ExcelJS.Worksheet, columns: SizeColumn[], r: RowInput) {
  const data: Record<string, string | number | null> = {
    kind: r.kind,
    code: r.code,
    product: r.product,
    line: r.line,
    category: r.category,
    muc: r.muc,
    label: r.label,
    total: r.total || null,
    done: r.done,
    date: r.date,
    note: r.note,
  };
  columns.forEach((c, i) => {
    const cell = r.cells[i];
    // Phân loại không khai báo size này → ô trống, khác hẳn với số 0.
    data[`s${c.id}`] =
      cell?.orderSizeId == null ? null : cell.value || null;
  });

  const row = ws.addRow(data);
  row.alignment = { vertical: "middle" };
  row.getCell("label").alignment = { indent: r.indent * 2 };
  row.getCell("kind").alignment = { horizontal: "center" };
  for (const c of columns) row.getCell(`s${c.id}`).alignment = { horizontal: "center" };
  row.getCell("total").alignment = { horizontal: "center" };
  row.getCell("done").alignment = { horizontal: "center" };

  if (r.bold) {
    row.font = { bold: true };
  } else {
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SUB_FILL } };
  }
}
