// Điều hướng bàn phím của bảng, tách hẳn khỏi React để kiểm chứng được.
// OrdersGrid render một cây; bàn phím lại cần một danh sách phẳng đúng bằng những
// gì đang nhìn thấy. `buildNav` làm phép chiếu đó, phần còn lại chỉ là số học
// trên danh sách ấy.
import type { GridOrder } from "./grid-types";

export type NavKind = "order" | "parent" | "part" | "batch";

/**
 * Dòng bị Delete xoá thì xoá cái gì. Hai đích khác nhau đi hai server action
 * khác nhau, nên phải nói rõ ngay từ đây thay vì để bảng đoán lại theo `kind`.
 */
export type NavTarget =
  | { kind: "stage"; stageId: number; categoryId: number; label: string }
  | { kind: "batch"; movementId: number; label: string };

export type NavRow = {
  /** Trùng với `data-nav` trên DOM. */
  id: string;
  kind: NavKind;
  /** Key của GridRow sở hữu dòng này — để tra ngược về dữ liệu. */
  rowKey: string;
  /** Tick chọn được, và do đó Delete xoá được. */
  selectable: boolean;
  /** Delete xoá cái gì; null ở dòng không xoá được (LSX, chi tiết). */
  target: NavTarget | null;
  expandable: boolean;
  expanded: boolean;
  /** id của dòng cấp trên; null ở dòng LSX. */
  parentId: string | null;
  /**
   * Ô nào GÕ được, theo chỉ số cột: size 0..n-1, rồi Tổng, Ngày, Ghi chú.
   * Ô không gõ được vẫn ĐI QUA được.
   */
  editable: boolean[];
  /** Cột A có gõ được không — đổi tên mục. Cột A nằm ngoài mảng `editable`. */
  nameEditable: boolean;
};

/**
 * Con trỏ trỏ theo `id` chứ không theo chỉ số: mở/gập dòng làm chỉ số trượt đi.
 * `col` = -1 là cột A (tên), 0..n-1 là các cột size, rồi Tổng / Ngày / Ghi chú.
 */
export type Cursor = { id: string; col: number };

/**
 * Cột A — ô tên ở mép trái mỗi dòng. Vẫn nằm riêng, vì nó không phải một ô của
 * lưới: nó dính trái, ôm cả checkbox lẫn nút gập, và CSS kéo khung ô từ chính
 * `.sheet-row` xuống. Cho nó chỉ số -1 rẻ hơn là dồn cả bảng sang 1-based.
 */
export const COL_NAME = -1;

/**
 * Ba cột đuôi, sau cụm size: Tổng (chỉ đọc), Ngày, Ghi chú.
 * Mũi tên đi tới được cả ba — "khắp các ô" phải nghĩa là khắp thật.
 */
export const TAIL_COLS = 3;
export const colTotal = (n: number) => n;
export const colDate = (n: number) => n + 1;
export const colNote = (n: number) => n + 2;

/**
 * Dựng mảng `editable` đủ chiều dài cho một dòng: `n` cột size + ba cột đuôi.
 * Mọi dòng phải cùng chiều dài, không thì ↑/↓ giữ nguyên cột sẽ rơi ra ngoài.
 */
export function editableCols(
  sizes: boolean[],
  tail: { date: boolean; note: boolean }
): boolean[] {
  return [...sizes, false, tail.date, tail.note];
}

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
      // SL gốc sửa trong form LSX, không sửa ở bảng; và LSX chỉ mất đi khi
      // phân loại cuối cùng của nó bị xoá, chứ không xoá thẳng từ bảng.
      selectable: false,
      target: null,
      expandable: order.rows.length > 0,
      expanded: orderOpen,
      parentId: null,
      editable: editableCols(
        order.plan.map(() => false),
        { date: true, note: true }
      ),
      // Mã LSX sửa trong form của nó, không sửa ở bảng.
      nameEditable: false,
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
        target: {
          kind: "stage",
          stageId: row.stageId,
          categoryId: row.categoryId,
          label:
            row.stageId > 0
              ? `${row.code} · ${row.categoryName} · ${row.mucLabel}`
              : `${row.code} · ${row.categoryName}`,
        },
        expandable: row.stageId > 0,
        expanded: open,
        parentId: order.key,
        // Ô dòng mục là tổng các đợt bên dưới — số suy ra, không gõ thẳng được.
        // Ngày/Ghi chú của nó cũng là số liệu suy ra (ngày LSX, trạng thái đủ/thiếu).
        editable: editableCols(
          row.cells.map(() => false),
          { date: false, note: false }
        ),
        // Nhưng TÊN mục thì gõ được: đổi tên tại chỗ, và đó cũng là chỗ mục tự
        // do sống. Dòng giữ chỗ chưa có mục nào thì chưa có gì để đặt tên.
        nameEditable: row.stageId > 0,
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
            target: null,
            expandable: true,
            expanded: partOpen,
            parentId: rowId,
            // Chi tiết chỉ có định mức; nó không có ngày, còn ghi chú là chữ
            // "Định mức" cố định.
            editable: editableCols(
              part.cells.map((c) => c.orderSizeId != null),
              { date: false, note: false }
            ),
            nameEditable: false,
          });

          if (!partOpen) continue;

          for (const b of part.batches ?? [])
            out.push({
              id: `${partId}/${b.key}`,
              kind: "batch",
              rowKey: row.key,
              selectable: true,
              target: { kind: "batch", movementId: b.movementId!, label: b.label },
              expandable: false,
              expanded: false,
              parentId: partId,
              editable: editableCols(
                b.cells.map((c) => c.orderSizeId != null),
                { date: true, note: true }
              ),
              nameEditable: false,
            });
        }
      } else {
        for (const child of row.children)
          out.push({
            id: `${rowId}/${child.key}`,
            kind: "batch",
            rowKey: row.key,
            selectable: true,
            target: {
              kind: "batch",
              movementId: child.movementId!,
              label: child.label,
            },
            expandable: false,
            expanded: false,
            parentId: rowId,
            editable: editableCols(
              child.cells.map((c) => c.orderSizeId != null),
              { date: true, note: true }
            ),
            nameEditable: false,
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

export function rowAt(nav: NavRow[], id: string): NavRow | undefined {
  return nav[indexOfRow(nav, id)];
}

/** Ô này gõ được không. */
export function isEditable(r: NavRow | undefined, col: number): boolean {
  if (!r) return false;
  if (col === COL_NAME) return r.nameEditable;
  return !!r.editable[col];
}

/**
 * "Không có ô nào" — KHÔNG dùng -1, vì -1 giờ là một cột thật (cột A). Lẫn hai
 * cái đó thì Tab ở một dòng không có ô nào gõ được sẽ nhảy vào ô tên của nó.
 */
export const NO_COL = -2;

/** Ô GÕ ĐƯỢC kề bên trong cùng một dòng, quét cả cột A. Chỉ Tab dùng tới. */
function nextEditableCol(r: NavRow, from: number, dir: 1 | -1): number {
  for (let c = from + dir; c >= COL_NAME && c < r.editable.length; c += dir)
    if (isEditable(r, c)) return c;
  return NO_COL;
}

export function firstEditableCol(r: NavRow): number {
  return nextEditableCol(r, COL_NAME - 1, 1);
}

export function lastEditableCol(r: NavRow): number {
  return nextEditableCol(r, r.editable.length, -1);
}

/**
 * ↑/↓ — sang đúng dòng kề, giữ nguyên cột, như Excel. Không bỏ qua dòng nào và
 * không bỏ qua ô chỉ đọc: con trỏ đậu được ở mọi ô, chỉ là gõ vào thì không.
 * Trả về null nghĩa là "hết bảng, đứng yên".
 */
export function moveVertical(nav: NavRow[], cur: Cursor, dir: 1 | -1): Cursor | null {
  const i = indexOfRow(nav, cur.id);
  if (i < 0) return null;

  const j = i + dir;
  if (j < 0 || j >= nav.length) return null;

  // Số cột size như nhau ở mọi dòng, nên cột giữ nguyên là luôn hợp lệ.
  return { id: nav[j].id, col: cur.col };
}

/**
 * ←/→ — sang ô kề trong cùng một dòng, dừng ở hai mép. Không tràn sang dòng khác
 * (việc đó của Tab) và không gập/mở gì cả (việc đó của Ctrl+←/→).
 */
export function moveHorizontal(nav: NavRow[], cur: Cursor, dir: 1 | -1): Cursor | null {
  const r = rowAt(nav, cur.id);
  if (!r) return null;

  const col = cur.col + dir;
  if (col < COL_NAME || col >= r.editable.length) return null;
  return { id: r.id, col };
}

/**
 * Tab / Shift+Tab — nhảy giữa các ô GÕ ĐƯỢC, tràn sang dòng kế khi hết dòng.
 *
 * Cố ý khác mũi tên: đây là lối đi của người đang nhập liệu, không phải của
 * người đang ngắm bảng. Giống Tab trên một sheet Excel đã khoá ô — nó bỏ qua ô
 * khoá và đưa thẳng tới chỗ gõ được tiếp theo.
 */
export function moveTab(nav: NavRow[], cur: Cursor, dir: 1 | -1): Cursor | null {
  const i = indexOfRow(nav, cur.id);
  if (i < 0) return null;

  const here = nextEditableCol(nav[i], cur.col, dir);
  if (here !== NO_COL) return { id: nav[i].id, col: here };

  for (let j = i + dir; j >= 0 && j < nav.length; j += dir) {
    const c = dir > 0 ? firstEditableCol(nav[j]) : lastEditableCol(nav[j]);
    if (c !== NO_COL) return { id: nav[j].id, col: c };
  }
  return null;
}

/** Hành động gập/mở; caller tự quyết cách áp dụng. */
export type RowAction =
  | { kind: "collapse"; id: string }
  | { kind: "expand"; id: string }
  | { kind: "goto"; cursor: Cursor }
  | null;

/**
 * Ctrl+← — gập dòng đang mở; đã gập rồi (hoặc không gập được) thì leo lên dòng
 * cấp trên. Giữ nguyên cột: leo cây mà con trỏ nhảy về mép trái thì mất chỗ.
 */
export function collapseOrOut(nav: NavRow[], cur: Cursor): RowAction {
  const r = rowAt(nav, cur.id);
  if (!r) return null;
  if (r.expandable && r.expanded) return { kind: "collapse", id: r.id };
  if (r.parentId) return { kind: "goto", cursor: { id: r.parentId, col: cur.col } };
  return null;
}

/** Ctrl+→ — mở dòng đang gập; đã mở rồi thì đi vào dòng con đầu tiên. */
export function expandOrIn(nav: NavRow[], cur: Cursor): RowAction {
  const i = indexOfRow(nav, cur.id);
  const r = nav[i];
  if (!r || !r.expandable) return null;
  if (!r.expanded) return { kind: "expand", id: r.id };

  // Đã mở thì dòng con đầu tiên nằm ngay kế bên trong danh sách phẳng.
  const child = nav[i + 1];
  if (child?.parentId !== r.id) return null;
  return { kind: "goto", cursor: { id: child.id, col: cur.col } };
}

/** id của các dòng tick được nằm trong dải neo→đầu. */
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
    .map((r) => r.id);
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
    if (indexOfRow(nav, id) >= 0) return { id, col: cur.col };
  }
  return null;
}
