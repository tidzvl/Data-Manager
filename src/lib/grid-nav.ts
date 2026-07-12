// Điều hướng bàn phím của bảng kính, tách hẳn khỏi React để kiểm chứng được.
// OrdersGrid render một cây; bàn phím lại cần một danh sách phẳng đúng bằng những
// gì đang nhìn thấy. `buildNav` làm phép chiếu đó, phần còn lại chỉ là số học
// trên danh sách ấy.
import type { GridOrder } from "./grid-types";

export type NavKind = "order" | "parent" | "part" | "batch";

export type NavRow = {
  /** Trùng với `data-nav` trên DOM. */
  id: string;
  kind: NavKind;
  /** Key của GridRow sở hữu dòng này — dùng để tick chọn và xoá. */
  rowKey: string;
  /** Chỉ dòng cha mới có checkbox. */
  selectable: boolean;
  expandable: boolean;
  expanded: boolean;
  /** id của dòng cấp trên; null ở dòng cha. */
  parentId: string | null;
  /** Ô nào sửa được, theo chỉ số cột size. */
  editable: boolean[];
};

/** Con trỏ trỏ theo `id` chứ không theo chỉ số: mở/gập dòng làm chỉ số trượt đi. */
export type Cursor = { id: string; col: number };

/** Con trỏ đứng ở cấp DÒNG, chưa vào ô nào. */
export const ROW_LEVEL = -1;

/**
 * Chiếu cây đang hiển thị thành danh sách phẳng. Dòng gập lại thì con của nó
 * không có mặt — mắt không thấy thì phím cũng không đi qua.
 *
 * `id` là đường dẫn từ gốc ("order-1/stage-2/part-3"), không phải key trần. Nhờ
 * vậy `reanchor` chỉ cần cắt dần đuôi là leo được lên tổ tiên, và ba bảng `open*`
 * không thể đụng key của nhau. Phải khớp từng nhánh với phần render của OrdersGrid.
 */
export function buildNav(
  orders: GridOrder[],
  openOrders: Record<string, boolean>,
  openRows: Record<string, boolean>,
  openParts: Record<string, boolean>
): NavRow[] {
  const out: NavRow[] = [];

  for (const order of orders) {
    const orderOpen = !!openOrders[order.key] && order.rows.length > 0;

    out.push({
      id: order.key,
      kind: "order",
      rowKey: order.key,
      // SL dự kiến sửa trong form LSX, không sửa ở bảng — nên dòng LSX không có
      // ô nào nhập được và cũng không có checkbox (tick theo mục).
      selectable: false,
      expandable: order.rows.length > 0,
      expanded: orderOpen,
      parentId: null,
      editable: order.plan.map(() => false),
    });

    if (!orderOpen) continue;

    for (const row of order.rows) {
      const rowId = `${order.key}/${row.key}`;
      // Dòng giữ chỗ (chưa có mục) không mở ra được.
      const open = !!openRows[rowId] && row.stageId > 0;

      out.push({
        id: rowId,
        kind: "parent",
        rowKey: row.key,
        selectable: true,
        expandable: row.stageId > 0,
        expanded: open,
        parentId: order.key,
        // "Gửi may" lấy target từ tổng định mức chi tiết nên ô dòng mục chỉ đọc.
        editable: row.cells.map(
          (c) => row.editableTarget && c.orderSizeId != null
        ),
      });

      if (!open) continue;

      if (row.muc === "SEW_OUT") {
        for (const part of row.children) {
          const partId = `${rowId}/${part.key}`;
          const partOpen = !!openParts[partId];

          out.push({
            id: partId,
            kind: "part",
            rowKey: row.key,
            selectable: false,
            expandable: true,
            expanded: partOpen,
            parentId: rowId,
            editable: part.cells.map((c) => c.orderSizeId != null),
          });

          if (!partOpen) continue;

          for (const b of part.batches ?? [])
            out.push({
              id: `${partId}/${b.key}`,
              kind: "batch",
              rowKey: row.key,
              selectable: false,
              expandable: false,
              expanded: false,
              parentId: partId,
              editable: b.cells.map((c) => c.orderSizeId != null),
            });
        }
      } else {
        for (const child of row.children)
          out.push({
            id: `${rowId}/${child.key}`,
            kind: "batch",
            rowKey: row.key,
            selectable: false,
            expandable: false,
            expanded: false,
            parentId: rowId,
            editable: child.cells.map((c) => c.orderSizeId != null),
          });
      }
    }
  }

  return out;
}

/** Cấp của một id, suy từ số đoạn: 0 = LSX, 1 = mục, 2 = chi tiết. */
export function depthOf(id: string): number {
  return id.split("/").length - 1;
}

export function indexOfRow(nav: NavRow[], id: string): number {
  return nav.findIndex((r) => r.id === id);
}

export function firstEditableCol(r: NavRow): number {
  return r.editable.indexOf(true);
}

export function lastEditableCol(r: NavRow): number {
  return r.editable.lastIndexOf(true);
}

/** Ô sửa được kề bên trong cùng một dòng; -1 nếu hết. */
function nextEditableCol(r: NavRow, from: number, dir: 1 | -1): number {
  for (let c = from + dir; c >= 0 && c < r.editable.length; c += dir)
    if (r.editable[c]) return c;
  return -1;
}

/**
 * ↑/↓. Trả về null nghĩa là "hết đường, đứng yên".
 *
 * `sticky` = đang mở chế độ sửa. Lúc đó bỏ qua mọi dòng không sửa được ở cột
 * ấy — nhảy vào một ô "—" rồi kẹt lại thì mạch nhập đứt. Còn lúc chỉ duyệt
 * bảng thì đi sang đúng dòng kề: thà tụt về cấp dòng còn hơn âm thầm phóng qua
 * năm dòng.
 */
export function moveVertical(
  nav: NavRow[],
  cur: Cursor,
  dir: 1 | -1,
  sticky: boolean
): Cursor | null {
  const i = indexOfRow(nav, cur.id);
  if (i < 0) return null;

  if (cur.col === ROW_LEVEL) {
    const j = i + dir;
    return j >= 0 && j < nav.length ? { id: nav[j].id, col: ROW_LEVEL } : null;
  }

  if (!sticky) {
    const j = i + dir;
    if (j < 0 || j >= nav.length) return null;
    return {
      id: nav[j].id,
      col: nav[j].editable[cur.col] ? cur.col : ROW_LEVEL,
    };
  }

  for (let j = i + dir; j >= 0 && j < nav.length; j += dir)
    if (nav[j].editable[cur.col]) return { id: nav[j].id, col: cur.col };

  return null;
}

/**
 * ←/→ bên trong một dòng. Không tràn sang dòng khác — đó là việc của Tab.
 * Hết bên trái thì tụt về cấp dòng; ở cấp dòng thì `→` vào ô đầu tiên.
 * Caller lo phần mở/gập trước khi gọi.
 */
export function moveHorizontal(
  nav: NavRow[],
  cur: Cursor,
  dir: 1 | -1
): Cursor | null {
  const r = nav[indexOfRow(nav, cur.id)];
  if (!r) return null;

  if (cur.col === ROW_LEVEL) {
    if (dir < 0) return null;
    const c = firstEditableCol(r);
    return c < 0 ? null : { id: r.id, col: c };
  }

  const c = nextEditableCol(r, cur.col, dir);
  if (c >= 0) return { id: r.id, col: c };
  return dir < 0 ? { id: r.id, col: ROW_LEVEL } : null;
}

/** Tab / Shift+Tab: như ←/→ nhưng hết dòng thì tràn sang dòng kế có ô sửa được. */
export function moveTab(
  nav: NavRow[],
  cur: Cursor,
  dir: 1 | -1
): Cursor | null {
  const i = indexOfRow(nav, cur.id);
  if (i < 0) return null;

  if (cur.col !== ROW_LEVEL) {
    const c = nextEditableCol(nav[i], cur.col, dir);
    if (c >= 0) return { id: nav[i].id, col: c };
  } else if (dir > 0) {
    // Từ cấp dòng, Tab đi vào ô đầu của chính dòng đó trước.
    const c = firstEditableCol(nav[i]);
    if (c >= 0) return { id: nav[i].id, col: c };
  }

  for (let j = i + dir; j >= 0 && j < nav.length; j += dir) {
    const c = dir > 0 ? firstEditableCol(nav[j]) : lastEditableCol(nav[j]);
    if (c >= 0) return { id: nav[j].id, col: c };
  }
  return null;
}

/**
 * `←` ở cấp dòng: gập dòng đang mở, còn không thì leo lên dòng cấp trên.
 * Trả về hành động để caller tự quyết cách áp dụng.
 */
export type RowAction =
  | { kind: "collapse"; id: string }
  | { kind: "expand"; id: string }
  | { kind: "goto"; cursor: Cursor }
  | null;

export function collapseOrOut(nav: NavRow[], cur: Cursor): RowAction {
  const r = nav[indexOfRow(nav, cur.id)];
  if (!r) return null;
  if (r.expandable && r.expanded) return { kind: "collapse", id: r.id };
  if (r.parentId) return { kind: "goto", cursor: { id: r.parentId, col: ROW_LEVEL } };
  return null;
}

export function expandOrIn(nav: NavRow[], cur: Cursor): RowAction {
  const r = nav[indexOfRow(nav, cur.id)];
  if (!r) return null;
  if (r.expandable && !r.expanded) return { kind: "expand", id: r.id };
  const next = moveHorizontal(nav, cur, 1);
  return next ? { kind: "goto", cursor: next } : null;
}

/** Các rowKey nằm trong dải neo→đầu, chỉ tính dòng có checkbox. */
export function selectableRange(
  nav: NavRow[],
  anchorId: string,
  headId: string
): string[] {
  const a = indexOfRow(nav, anchorId);
  const b = indexOfRow(nav, headId);
  if (a < 0 || b < 0) return [];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return nav
    .slice(lo, hi + 1)
    .filter((r) => r.selectable)
    .map((r) => r.rowKey);
}

/**
 * Con trỏ đang ở dòng vừa bị gập mất thì kéo nó về tổ tiên gần nhất còn hiện.
 * Không có tổ tiên nào → null, caller bỏ con trỏ đi.
 */
export function reanchor(nav: NavRow[], cur: Cursor | null): Cursor | null {
  if (!cur) return null;
  if (indexOfRow(nav, cur.id) >= 0) return cur;

  // id của dòng con luôn có tiền tố là id của dòng cha ("a/b/c" → "a/b" → "a").
  let id = cur.id;
  while (id.includes("/")) {
    id = id.slice(0, id.lastIndexOf("/"));
    if (indexOfRow(nav, id) >= 0) return { id, col: ROW_LEVEL };
  }
  return null;
}
