"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronsUpDown,
  Download,
  Pencil,
  Plus,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { exportGridXlsx } from "@/app/actions/export";
import { downloadBase64 } from "./download";
import type { MovementType } from "@prisma/client";
import {
  MUC_LABEL,
  type Cell,
  type GridChild,
  type GridOrder,
  type GridRow,
  type SizeColumn,
} from "@/lib/grid-types";
import {
  addBatch,
  addPart,
  addStage,
  deleteBatch,
  deleteRows,
  setItemQty,
  setMovementDate,
  setOrderCreatedAt,
  setPartTarget,
  type CellResult,
} from "@/app/actions/grid";
import OrderFormModal from "@/components/forms/OrderFormModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SheetProvider } from "@/components/ui/sheet-context";
import { useHotkeys } from "@/lib/hotkeys";
import {
  ROW_LEVEL,
  buildNav,
  collapseOrOut,
  depthOf,
  expandOrIn,
  indexOfRow,
  moveHorizontal,
  moveTab,
  moveVertical,
  reanchor,
  selectableRange,
  type Cursor,
} from "@/lib/grid-nav";

/**
 * Bảng LSX kiểu bảng tính, ba tầng: LSX → Mục (Phân loại) → Đợt nhận.
 * Riêng "Gửi may" chèn thêm một tầng chi tiết bán thành phẩm giữa mục và đợt,
 * vì định mức của nó khai theo từng chi tiết chứ không theo cả mục.
 */

/**
 * Con trỏ bàn phím. Ô tự hỏi "tôi có đang được trỏ không" thay vì bảng phải
 * biết từng ô; và mọi lệnh di chuyển đều đi qua đây nên `EditCell` không cần
 * biết gì về hình dạng của bảng.
 */
type NavApi = {
  at: (id: string, col: number) => boolean;
  editing: boolean;
  tabIndex: (id: string, col: number) => 0 | -1;
  point: (id: string, col: number) => void;
  open: (id: string, col: number) => void;
  stopEditing: () => void;
  /** Dòng "+ Thêm…" nào đang mở; đúng một cái trong cả bảng. */
  addOpen: string | null;
  setAddOpen: (id: string | null) => void;
  /** Trả về false nghĩa là hết đường — caller tự quyết làm gì tiếp. */
  move: (dir: "up" | "down" | "left" | "right", sticky: boolean) => boolean;
  tab: (dir: 1 | -1) => boolean;
};

const NavCtx = createContext<NavApi>({
  at: () => false,
  editing: false,
  tabIndex: () => -1,
  point: () => {},
  open: () => {},
  stopEditing: () => {},
  addOpen: null,
  setAddOpen: () => {},
  move: () => false,
  tab: () => false,
});

/** Thụt đầu dòng của cột A theo tầng. */
const INDENT = { order: 12, stage: 34, part: 58, batch: 58, subBatch: 82 };

/** Nền của dòng theo tầng — xem ghi chú `--row-bg` trong globals.css. */
const ROW_BG = {
  order: "var(--s-card)",
  stage: "var(--s-band-2)",
  part: "var(--s-band-3)",
  batch: "var(--s-band-3)",
  subBatch: "var(--s-band-4)",
};

/** Dải sáng chạy suốt chiều cao, nằm trên các dòng (dòng ở đây có nền đục). */
function ColumnBands() {
  return (
    <>
      <div className="sheet-colband sheet-colband--hover" />
      <div className="sheet-colband sheet-colband--edit" />
    </>
  );
}

/**
 * Toạ độ của một ô trong hệ quy chiếu nội dung bảng.
 * Đo theo `.sheet-row` cha chứ không theo viewport: hàng luôn bắt đầu đúng ở
 * mép trái vùng nội dung, nên số đo không đổi khi cuộn ngang.
 */
function measureCell(cell: Element): { x: number; w: number } | null {
  const row = cell.closest(".sheet-row");
  if (!row) return null;
  const c = cell.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  return { x: c.left - r.left, w: c.width };
}

/** yyyy-mm-dd của hôm nay, theo giờ máy người dùng. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Ô chưa đủ định mức → đỏ; không có số / phân loại không khai báo size này →
 * xám nhạt; còn lại giữ màu của tầng.
 */
function cellColor(c: Cell, lit: string): string {
  if (c.orderSizeId == null) return "var(--s-dash)";
  if (c.target > 0 && c.done < c.target) return "var(--s-short)";
  if (c.value === 0) return "var(--s-dash)";
  return lit;
}

export default function OrdersGrid({
  orders,
  columns,
}: {
  orders: GridOrder[];
  columns: SizeColumn[];
}) {
  const n = columns.length;
  // Cột size co giãn: khi bảng rộng hơn nội dung, phần dư chia đều cho cụm size
  // thay vì dồn hết vào Ghi chú và để giữa bảng hở một mảng lớn.
  const gridCols = `330px 118px repeat(${n},minmax(56px,0.5fr)) 82px 100px minmax(150px,1fr) 108px`;
  const minWidth = 888 + n * 56;

  const [openOrders, setOpenOrders] = useState<Record<string, boolean>>({});
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [openParts, setOpenParts] = useState<Record<string, boolean>>({});
  const [editOrder, setEditOrder] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  /** Dòng đang chờ xác nhận xoá; null = không có hộp thoại nào. */
  const [pendingDelete, setPendingDelete] = useState<GridRow[] | null>(null);
  const [deleting, startDelete] = useTransition();
  const [exporting, startExport] = useTransition();
  const router = useRouter();

  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState<string | null>(null);
  /** Neo của dải Shift+↑/↓; đặt lại mỗi khi tick bằng Space. */
  const anchor = useRef<string | null>(null);

  /** Đúng những dòng đang nhìn thấy, đã trải phẳng. */
  const nav = useMemo(
    () => buildNav(orders, openOrders, openRows, openParts),
    [orders, openOrders, openRows, openParts]
  );

  const allRows = useMemo(() => orders.flatMap((o) => o.rows), [orders]);

  // Mở sẵn LSX đầu tiên: bảng mở ra mà mọi thứ đều gập lại thì không thấy được
  // hình dạng của dữ liệu.
  useEffect(() => {
    setOpenOrders((s) =>
      Object.keys(s).length > 0 || orders.length === 0
        ? s
        : { [orders[0].key]: true }
    );
  }, [orders]);

  // Đổi trang / đổi bộ lọc thì bỏ chọn — key cũ không còn ứng với dòng nào.
  useEffect(() => {
    setSelected({});
    anchor.current = null;
  }, [orders]);

  // Gập một dòng có thể nuốt mất dòng đang trỏ. Kéo con trỏ về tổ tiên gần nhất
  // còn hiện, chứ đừng để nó trỏ vào hư không.
  useEffect(() => {
    if (!cursor) return;
    const next = reanchor(nav, cursor);
    if (next === cursor) return;
    setCursor(next);
    setEditing(false);
  }, [nav, cursor]);

  const selectedRows = allRows.filter((r) => selected[r.key]);

  /** Dòng giữ chỗ không có mục nào nên không có gì để xuất. */
  const runExport = (targets: GridRow[]) =>
    startExport(async () => {
      const stageIds = targets.filter((r) => r.stageId > 0).map((r) => r.stageId);
      if (stageIds.length === 0) {
        toast.error("Các dòng đã chọn chưa có mục nào để xuất.");
        return;
      }
      const res = await exportGridXlsx({ mode: "selected", stageIds });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      downloadBase64(res.fileName, res.base64);
      toast.success(`Đã xuất ${res.rows} dòng ra ${res.fileName}`);
    });

  const runDelete = (targets: GridRow[]) =>
    startDelete(async () => {
      // Mỗi dòng là một đích riêng: dòng mục → xoá mục đó; dòng giữ chỗ → xoá
      // phân loại.
      const res = await deleteRows(
        targets.map((r) => ({ stageId: r.stageId, categoryId: r.categoryId }))
      );
      setPendingDelete(null);
      if (!res.ok) {
        toast.error(res.error ?? "Lỗi khi xoá.");
        return;
      }
      setSelected({});
      const s = res.summary;
      const parts = [
        s?.stages ? `${s.stages} mục` : null,
        s?.categories ? `${s.categories} phân loại` : null,
        s?.orders ? `${s.orders} LSX rỗng` : null,
      ].filter(Boolean);
      toast.success(`Đã xoá ${parts.join(", ") || "0 dòng"}.`);
      router.refresh();
    });

  const scopeRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const setAttr = (name: string, value: string | null) => {
    const el = scopeRef.current;
    if (!el) return;
    if (value == null) el.removeAttribute(name);
    else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  /** Đặt vị trí một dải theo ô mẫu; trả về false nếu không đo được. */
  const placeBand = (prefix: "col" | "edit", cell: Element | null): boolean => {
    const el = scopeRef.current;
    if (!el || !cell) return false;
    const m = measureCell(cell);
    if (!m) return false;
    el.style.setProperty(`--${prefix}-x`, `${m.x}px`);
    el.style.setProperty(`--${prefix}-w`, `${m.w}px`);
    return true;
  };

  /** Cột dưới con trỏ, đọc từ `data-col` của ô gần nhất. */
  const trackHover = (e: React.MouseEvent) => {
    const cell = (e.target as Element).closest?.("[data-col]") ?? null;
    if (!cell || !placeBand("col", cell)) {
      setAttr("data-hovercol", null);
      return;
    }
    setAttr("data-hovercol", cell.getAttribute("data-col"));
  };

  /** Cấp của id quyết định nó nằm ở bảng `open*` nào. */
  const setOpen = (id: string, on: boolean) => {
    const d = depthOf(id);
    if (d === 0) setOpenOrders((s) => ({ ...s, [id]: on }));
    else if (d === 1) setOpenRows((s) => ({ ...s, [id]: on }));
    else setOpenParts((s) => ({ ...s, [id]: on }));
  };
  const toggle = (id: string, on: boolean) => setOpen(id, on);

  /**
   * Con trỏ là nguồn sự thật duy nhất; DOM chạy theo nó. Lấy nét ở đây (chứ
   * không `autoFocus` trong từng ô) vì cùng một chỗ này còn phải cuộn ô vào tầm
   * mắt và lái dải sáng của cột.
   */
  useEffect(() => {
    // Dòng "+ Thêm…" đang mở thì nét thuộc về ô nhập của nó. Bấm `a` làm dòng
    // nở ra, tức `nav` đổi — không chặn ở đây thì effect này giật nét khỏi ô
    // vừa `autoFocus` và người dùng phải với chuột.
    if (addOpen) return;

    const body = bodyRef.current;
    if (!body || !cursor) {
      setAttr("data-editcol", null);
      return;
    }
    const row = body.querySelector(`[data-nav="${CSS.escape(cursor.id)}"]`);
    const el =
      cursor.col === ROW_LEVEL
        ? (row as HTMLElement | null)
        : row?.querySelector<HTMLElement>(`[data-col="${cursor.col}"]`) ?? null;

    if (!el) {
      setAttr("data-editcol", null);
      return;
    }

    // Chỉ đụng vào nét khi nó chưa ở đúng chỗ. `select()` vô điều kiện sẽ bôi
    // đen số đang gõ dở mỗi lần `router.refresh()` của ô trước đó trả về, và
    // phím kế tiếp đè mất những gì vừa gõ.
    if (document.activeElement !== el) {
      // Cuộn tay sau đó, vì `focus()` tự cuộn theo kiểu riêng của trình duyệt
      // và hay giật ô lên giữa vùng nhìn.
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (el instanceof HTMLInputElement) el.select();
    }

    if (cursor.col !== ROW_LEVEL && placeBand("edit", el))
      setAttr("data-editcol", String(cursor.col));
    else setAttr("data-editcol", null);
  }, [cursor, editing, nav, addOpen]);

  /** Dời con trỏ; ra khỏi hàng ô thì đóng luôn chế độ sửa. */
  const goTo = (next: Cursor | null, keepEditing: boolean) => {
    if (!next) return false;
    setCursor(next);
    setEditing(keepEditing && next.col !== ROW_LEVEL);
    return true;
  };

  const api: NavApi = {
    editing,
    at: (id, col) => cursor?.id === id && cursor.col === col,
    // Roving tabindex: cả bảng chỉ có đúng một điểm dừng cho phím Tab của trình
    // duyệt. Chưa trỏ đâu thì đó là dòng đầu tiên.
    tabIndex: (id, col) =>
      cursor
        ? cursor.id === id && cursor.col === col
          ? 0
          : -1
        : nav[0]?.id === id && col === ROW_LEVEL
          ? 0
          : -1,
    point: (id, col) =>
      setCursor((c) => (c && c.id === id && c.col === col ? c : { id, col })),
    open: (id, col) => {
      setCursor({ id, col });
      setEditing(true);
    },
    stopEditing: () => setEditing(false),
    addOpen,
    setAddOpen,
    move: (dir, sticky) => {
      if (!cursor) return false;
      if (dir === "up" || dir === "down") {
        const d = dir === "down" ? 1 : -1;
        if (goTo(moveVertical(nav, cursor, d, sticky), sticky)) return true;
        // Hết bảng: đứng yên và đóng chế độ sửa — Enter phải luôn "chốt" ô.
        setEditing(false);
        return false;
      }
      // Ngang thì hết đường là đứng yên, giữ nguyên chế độ sửa: người dùng chỉ
      // gõ → thêm một nhát ở ô cuối, không có ý bỏ ô.
      const d = dir === "right" ? 1 : -1;
      return goTo(moveHorizontal(nav, cursor, d), sticky);
    },
    tab: (dir) => {
      if (!cursor) return false;
      return goTo(moveTab(nav, cursor, dir), editing);
    },
  };

  /** Mở/gập toàn bộ — Shift+→ / Shift+←. */
  const expandAll = () => {
    setOpenOrders(Object.fromEntries(orders.map((o) => [o.key, true])));
    setOpenRows(
      Object.fromEntries(
        orders.flatMap((o) =>
          o.rows.filter((r) => r.stageId > 0).map((r) => [`${o.key}/${r.key}`, true])
        )
      )
    );
  };

  // Bắt phím ở tầng document: người dùng vừa mở trang là gõ được ngay, không
  // phải bấm vào bảng trước. `useHotkeys` đã lọc sạch input và modal.
  useHotkeys((e) => {
    if (nav.length === 0) return;
    const k = e.key;

    if (k === "Escape") {
      // Bóc từng lớp một: dòng nhập mới → đang sửa → đang chọn → đang trỏ. Không
      // preventDefault, vì lớp ngoài (popover ⚙ của thanh công cụ) cũng cần Escape.
      if (addOpen) setAddOpen(null);
      else if (editing) setEditing(false);
      else if (selectedRows.length > 0) {
        setSelected({});
        anchor.current = null;
      } else if (cursor) setCursor(null);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (k === "a" || k === "A")
        setSelected(Object.fromEntries(allRows.map((r) => [r.key, true])));
      else if (k === "Delete" || k === "Backspace") {
        if (selectedRows.length > 0) setPendingDelete(selectedRows);
      } else return;
      e.preventDefault();
      return;
    }
    if (e.altKey) return;

    if (!cursor) {
      // Phím di chuyển đầu tiên thả con trỏ vào bảng.
      if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Home" && k !== "End")
        return;
      setCursor({ id: nav[k === "End" ? nav.length - 1 : 0].id, col: ROW_LEVEL });
      e.preventDefault();
      return;
    }

    const here = nav[indexOfRow(nav, cursor.id)];

    if (e.shiftKey) {
      switch (k) {
        case "ArrowLeft":
          setOpenOrders({});
          setOpenRows({});
          setOpenParts({});
          break;
        case "ArrowRight":
          expandAll();
          break;
        case "ArrowUp":
        case "ArrowDown": {
          const i = indexOfRow(nav, cursor.id);
          const j = i + (k === "ArrowDown" ? 1 : -1);
          if (j < 0 || j >= nav.length) return;
          anchor.current ??= cursor.id;
          setCursor({ id: nav[j].id, col: ROW_LEVEL });
          setEditing(false);
          const keys = selectableRange(nav, anchor.current, nav[j].id);
          setSelected(Object.fromEntries(keys.map((x) => [x, true])));
          break;
        }
        case "Tab":
          // Không đi được thì nhả cho trình duyệt Tab ra khỏi bảng.
          if (!api.tab(-1)) return;
          break;
        default:
          return;
      }
      e.preventDefault();
      return;
    }

    switch (k) {
      case "ArrowDown":
      case "ArrowUp":
        anchor.current = null;
        api.move(k === "ArrowDown" ? "down" : "up", false);
        break;

      case "ArrowRight":
      case "ArrowLeft": {
        anchor.current = null;
        const right = k === "ArrowRight";
        if (cursor.col !== ROW_LEVEL) {
          api.move(right ? "right" : "left", false);
          break;
        }
        const act = right ? expandOrIn(nav, cursor) : collapseOrOut(nav, cursor);
        if (!act) return;
        if (act.kind === "goto") setCursor(act.cursor);
        else setOpen(act.id, act.kind === "expand");
        break;
      }

      // Ở một ô thì EditCell đã tự mở sửa và chặn phím; tới được đây nghĩa là
      // con trỏ đang ở cấp dòng.
      case "Enter":
        if (cursor.col !== ROW_LEVEL || !here?.expandable) return;
        setOpen(here.id, !here.expanded);
        break;

      // Thêm đợt / thêm chi tiết, tuỳ dòng đang trỏ. Đứng ở một đợt thì thêm
      // vào đúng nhóm chứa nó — đang gõ dở các đợt thì chẳng ai muốn leo ngược
      // lên dòng cha rồi mới bấm được. Ở dòng LSX thì không có gì để thêm.
      case "a":
      case "A": {
        if (!here || here.kind === "order") return;
        const target = here.kind === "batch" ? here.parentId! : here.id;
        // Dòng giữ chỗ chưa có mục nào thì không có gì để thêm vào.
        if (!nav[indexOfRow(nav, target)]?.expandable) return;
        setOpen(target, true);
        setAddOpen(`add:${target}`);
        break;
      }

      case "Tab":
        if (!api.tab(1)) return;
        break;

      case " ":
      case "x":
      case "X":
        // Dòng LSX và dòng con không có checkbox. Vẫn nuốt Space để trang không nhảy.
        if (here?.selectable) {
          setSelected((s) => ({ ...s, [here.rowKey]: !s[here.rowKey] }));
          anchor.current = here.id;
        } else if (k !== " ") return;
        break;

      case "Home":
      case "End":
        anchor.current = null;
        setCursor({
          id: nav[k === "End" ? nav.length - 1 : 0].id,
          col: ROW_LEVEL,
        });
        setEditing(false);
        break;

      default:
        return;
    }
    e.preventDefault();
  });

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <span
          className="mb-4 flex h-16 w-16 items-center justify-center rounded"
          style={{
            background: "var(--s-bar)",
            border: "1px solid var(--s-card-line)",
            color: "var(--s-muted)",
          }}
        >
          <SearchX size={28} />
        </span>
        <p style={{ color: "var(--s-ink-2)" }}>
          Không có lệnh sản xuất nào khớp bộ lọc.
        </p>
      </div>
    );
  }

  return (
    <NavCtx.Provider value={api}>
      <div
        ref={scopeRef}
        className="relative"
        style={{ ["--grid-cols" as string]: gridCols }}
        onMouseOver={trackHover}
        onMouseLeave={() => setAttr("data-hovercol", null)}
      >
        {/* Một vùng cuộn duy nhất: header dính đỉnh, cột A dính trái, ô giao
            của hai cái đó tự khắc luôn hiện. Không phải đồng bộ scroll tay. */}
        <div
          ref={bodyRef}
          className="overflow-auto"
          style={{ maxHeight: "76vh" }}
        >
          <div style={{ minWidth, position: "relative" }}>
            <ColumnBands />

            <Header
              columns={columns}
              allChecked={allRows.length > 0 && selectedRows.length === allRows.length}
              someChecked={selectedRows.length > 0}
              onToggleAll={(on) =>
                setSelected(
                  on ? Object.fromEntries(allRows.map((r) => [r.key, true])) : {}
                )
              }
            />

            {orders.map((order) => {
              const orderOpen = !!openOrders[order.key] && order.rows.length > 0;
              return (
                <div key={order.key}>
                  <OrderRow
                    order={order}
                    navId={order.key}
                    open={orderOpen}
                    onToggle={() => order.rows.length > 0 && toggle(order.key, !orderOpen)}
                    onEdit={() => setEditOrder(order.orderId)}
                  />

                  {orderOpen &&
                    order.rows.map((row) => {
                      const rowId = `${order.key}/${row.key}`;
                      const open = !!openRows[rowId] && row.stageId > 0;
                      return (
                        <div key={row.key} className="sheet-expand">
                          <StageRow
                            row={row}
                            navId={rowId}
                            open={open}
                            checked={!!selected[row.key]}
                            onToggle={() => row.stageId > 0 && toggle(rowId, !open)}
                            onCheck={(on) =>
                              setSelected((s) => ({ ...s, [row.key]: on }))
                            }
                            onDelete={() => setPendingDelete([row])}
                          />

                          {open && (
                            <div className="sheet-expand">
                              {row.muc === "SEW_OUT"
                                ? row.children.map((part) => (
                                    <PartBlock
                                      key={part.key}
                                      row={row}
                                      navId={`${rowId}/${part.key}`}
                                      part={part}
                                      columns={columns}
                                      open={!!openParts[`${rowId}/${part.key}`]}
                                      onToggle={() =>
                                        toggle(
                                          `${rowId}/${part.key}`,
                                          !openParts[`${rowId}/${part.key}`]
                                        )
                                      }
                                    />
                                  ))
                                : row.children.map((child) => (
                                    <BatchRow
                                      key={child.key}
                                      navId={`${rowId}/${child.key}`}
                                      child={child}
                                      indent={INDENT.batch}
                                      bg={ROW_BG.batch}
                                    />
                                  ))}

                              {row.muc === "SEW_OUT" ? (
                                <AddPartRow
                                  row={row}
                                  columns={columns}
                                  addId={`add:${rowId}`}
                                />
                              ) : (
                                <AddBatchRow
                                  row={row}
                                  columns={columns}
                                  partId={null}
                                  indent={INDENT.batch}
                                  bg={ROW_BG.batch}
                                  addId={`add:${rowId}`}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </div>

        {selectedRows.length > 0 && (
          <SelectionBar
            rowCount={selectedRows.length}
            exportable={selectedRows.filter((r) => r.stageId > 0).length}
            busy={deleting}
            exporting={exporting}
            onClear={() => setSelected({})}
            onExport={() => runExport(selectedRows)}
            onDelete={() => setPendingDelete(selectedRows)}
          />
        )}

        <OrderFormModal
          key={editOrder ?? "none"}
          open={editOrder !== null}
          onOpenChange={(v) => !v && setEditOrder(null)}
          orderId={editOrder ?? undefined}
          sheet
        />

        <SheetProvider value>
          <ConfirmDialog
            open={pendingDelete !== null}
            onOpenChange={(v) => !v && setPendingDelete(null)}
            danger
            title={deleteTitle(pendingDelete)}
            description={describeDelete(pendingDelete)}
            confirmLabel="Xoá"
            onConfirm={() => pendingDelete && runDelete(pendingDelete)}
          />
        </SheetProvider>
      </div>
    </NavCtx.Provider>
  );
}

/** Nhãn hiển thị của một mục: "Nhận thêu (Áo)"; chưa có mục thì chỉ còn phân loại. */
function stageLabel(r: GridRow): string {
  return r.stageId > 0 ? `${r.mucLabel} (${r.categoryName})` : r.categoryName;
}

/** Nhãn đầy đủ cho hộp thoại xoá: "LSX · Phân loại · Mục". */
function rowLabel(r: GridRow): string {
  return r.stageId > 0
    ? `${r.code} · ${r.categoryName} · ${r.mucLabel}`
    : `${r.code} · ${r.categoryName} (chưa có mục)`;
}

function deleteTitle(rows: GridRow[] | null): string {
  if (!rows || rows.length === 0) return "Xoá?";
  if (rows.length > 1) return `Xoá ${rows.length} dòng đã chọn?`;
  return rows[0].stageId > 0
    ? `Xoá mục "${rows[0].mucLabel}"?`
    : `Xoá phân loại "${rows[0].categoryName}"?`;
}

/** Nói rõ cái gì mất và cái gì ở lại — đây là chỗ dễ hiểu nhầm nhất. */
function describeDelete(rows: GridRow[] | null): string {
  if (!rows || rows.length === 0) return "";

  const labels = rows.map(rowLabel);
  const list =
    labels.length <= 3 ? labels.join("; ") : `${labels.slice(0, 3).join("; ")}…`;

  const stageRows = rows.filter((r) => r.stageId > 0);
  const catRows = rows.filter((r) => r.stageId === 0);
  const hasSewOut = stageRows.some((r) => r.muc === "SEW_OUT");

  const what: string[] = [];
  if (stageRows.length > 0) {
    what.push(
      hasSewOut
        ? "Mục bị xoá kèm dữ liệu của nó: định mức, chi tiết bán thành phẩm và các đợt đã gửi/nhận của mục đó."
        : "Mục bị xoá kèm SL kế hoạch và các đợt gửi/nhận của mục đó."
    );
    what.push("Các mục khác của cùng LSX, và bản thân LSX, đều giữ nguyên.");
  }
  if (catRows.length > 0) {
    what.push(
      "Phân loại chưa có mục nào sẽ bị xoá; nếu đó là phân loại cuối cùng thì LSX cũng bị xoá."
    );
  }

  return `${list}. ${what.join(" ")} Không hoàn tác được.`;
}

/** Thanh nổi khi có dòng được tick. */
function SelectionBar({
  rowCount,
  exportable,
  busy,
  exporting,
  onClear,
  onExport,
  onDelete,
}: {
  rowCount: number;
  exportable: number;
  busy: boolean;
  exporting: boolean;
  onClear: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const btn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "#fff",
    border: "1px solid var(--s-card-line)",
    borderRadius: 4,
    padding: "5px 10px",
    fontSize: 12,
    cursor: "pointer",
  };
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 12px 9px 16px",
        borderRadius: 4,
        fontSize: 13,
        background: "var(--s-bar)",
        border: "1px solid var(--s-card-line)",
        boxShadow: "0 10px 30px rgba(31,42,36,.22)",
      }}
    >
      <span>
        Đã chọn <b>{rowCount}</b> mục
      </span>
      <button onClick={onClear} style={btn}>
        Bỏ chọn
      </button>
      <button
        onClick={onExport}
        disabled={exporting || exportable === 0}
        title="Xuất các dòng đã chọn ra Excel"
        style={{
          ...btn,
          cursor: exporting || exportable === 0 ? "default" : "pointer",
          opacity: exporting || exportable === 0 ? 0.5 : 1,
        }}
      >
        <Download size={13} />{" "}
        {exporting ? "Đang xuất…" : `Xuất ${exportable} dòng`}
      </button>
      <button
        onClick={onDelete}
        disabled={busy}
        style={{
          ...btn,
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "var(--s-short)",
          fontWeight: 600,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Trash2 size={13} /> {busy ? "Đang xoá…" : "Xoá mục đã chọn"}
      </button>
    </div>
  );
}

/**
 * Header hai hàng. Là MỘT lưới chứ không phải hai dòng chồng lên nhau: các cột
 * ngoài cụm size phải cao suốt cả hai hàng (rowspan), mà rowspan chỉ có được khi
 * chúng nằm chung một lưới.
 */
function Header({
  columns,
  allChecked,
  someChecked,
  onToggleAll,
}: {
  columns: SizeColumn[];
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: (on: boolean) => void;
}) {
  const n = columns.length;
  const both = "1 / 3";
  /** Vị trí cột trong lưới (1-based): A, Chuyền may, size…, Tổng, Ngày, Ghi chú, thao tác. */
  const TOTAL = 3 + n;

  return (
    <div
      className="sheet-row sheet-head"
      style={{ gridTemplateRows: "auto auto", fontSize: 12, fontWeight: 600 }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gridColumn: 1, gridRow: both, gap: 7, fontSize: 12.5 }}
      >
        <RowCheckbox
          checked={allChecked}
          indeterminate={someChecked && !allChecked}
          onChange={onToggleAll}
          label="Chọn tất cả mục"
        />
        Lệnh SX · Mục · Đợt
      </span>

      <span className="sheet-cell" style={{ gridColumn: 2, gridRow: both }}>
        <SortHead sortKey="line">Chuyền may</SortHead>
      </span>

      <span
        className="sheet-cell sheet-head--sizes"
        style={{
          gridColumn: `3 / ${3 + n}`,
          gridRow: 1,
          justifyContent: "center",
          letterSpacing: ".4px",
          fontSize: 11,
        }}
      >
        SỐ LƯỢNG THEO SIZE
      </span>

      {columns.map((c, i) => (
        <span
          key={c.id}
          className="sheet-cell sheet-head--sizes"
          data-col={i}
          style={{
            gridColumn: 3 + i,
            gridRow: 2,
            justifyContent: "center",
            fontSize: 11,
            lineHeight: 1.1,
          }}
        >
          {c.label}
        </span>
      ))}

      <span
        className="sheet-cell sheet-cell--num"
        style={{ gridColumn: TOTAL, gridRow: both, fontWeight: 700 }}
      >
        Tổng
      </span>
      <span className="sheet-cell" style={{ gridColumn: TOTAL + 1, gridRow: both }}>
        <SortHead sortKey="createdAt">Ngày</SortHead>
      </span>
      <span className="sheet-cell" style={{ gridColumn: TOTAL + 2, gridRow: both }}>
        Ghi chú
      </span>
      <span
        className="sheet-cell"
        style={{ gridColumn: TOTAL + 3, gridRow: both, borderRight: "none" }}
      />
    </div>
  );
}

/** Nhãn cột bấm được để đảo chiều sắp xếp (chỉ các cột sort được ở DB). */
function SortHead({
  sortKey,
  children,
}: {
  sortKey: "code" | "line" | "productName" | "createdAt";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = params.get("sort") === sortKey;
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  const go = () => {
    const next = new URLSearchParams(params.toString());
    next.set("sort", sortKey);
    next.set("dir", active && dir === "asc" ? "desc" : "asc");
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <button
      onClick={go}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        font: "inherit",
        color: "#fff",
        opacity: active ? 1 : 0.92,
        whiteSpace: "nowrap",
      }}
    >
      {children}
      {active ? (
        dir === "asc" ? (
          <ArrowUp size={12} />
        ) : (
          <ArrowDown size={12} />
        )
      ) : (
        <ChevronsUpDown size={12} style={{ opacity: 0.5 }} />
      )}
    </button>
  );
}

/** Nút gập/mở 18×18 của cột A; chỗ trống giữ đúng bề rộng để nhãn luôn thẳng cột. */
function Chevron({
  open,
  hidden,
  onClick,
}: {
  open: boolean;
  hidden?: boolean;
  onClick?: () => void;
}) {
  if (hidden) return <span style={{ width: 18, flexShrink: 0 }} />;
  return (
    <button
      aria-label={open ? "Thu gọn" : "Mở rộng"}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        width: 18,
        height: 18,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
        border: "1px solid var(--s-card-line)",
        borderRadius: 3,
        color: "#3f4a43",
        cursor: "pointer",
        padding: 0,
      }}
    >
      <ChevronRight
        size={11}
        style={{
          transform: open ? "rotate(90deg)" : "none",
          transition: "transform .15s",
        }}
      />
    </button>
  );
}

/** Tầng 1 — một LSX: SL dự kiến (chỉ đọc, sửa trong form LSX). */
function OrderRow({
  order,
  navId,
  open,
  onToggle,
  onEdit,
}: {
  order: GridOrder;
  navId: string;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const nav = useContext(NavCtx);
  return (
    <div
      data-nav={navId}
      tabIndex={nav.tabIndex(navId, ROW_LEVEL)}
      onFocus={(e) => e.target === e.currentTarget && nav.point(navId, ROW_LEVEL)}
      onClick={() => {
        nav.point(navId, ROW_LEVEL);
        onToggle();
      }}
      className="sheet-row sheet-hover"
      style={{
        ["--row-bg" as string]: ROW_BG.order,
        cursor: "pointer",
        outline: "none",
      }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gap: 7, paddingLeft: INDENT.order }}
      >
        <Chevron
          open={open}
          hidden={order.rows.length === 0}
          onClick={onToggle}
        />
        <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--s-ink)" }}>
            {order.code}
          </span>
          <span
            className="truncate"
            style={{ fontSize: 11, color: "var(--s-muted)", maxWidth: 230 }}
          >
            {order.productName}
          </span>
        </span>
      </span>

      <span
        className="sheet-cell truncate"
        style={{ color: "var(--s-ink-2)", whiteSpace: "nowrap" }}
      >
        {order.lineName ?? (
          <span style={{ color: "var(--s-dash)" }}>chưa gán</span>
        )}
      </span>

      {order.plan.map((v, i) => (
        <span
          key={i}
          className="sheet-cell sheet-cell--num"
          data-col={i}
          style={{ color: v ? "var(--s-plan)" : "var(--s-dash)" }}
        >
          {v || "–"}
        </span>
      ))}

      <span
        className="sheet-cell sheet-cell--num"
        style={{
          fontWeight: 700,
          color: "var(--s-plan)",
          background: "var(--s-plan-bg)",
        }}
      >
        {order.planTotal || "–"}
      </span>

      <EditDateCell
        iso={order.createdAtIso}
        label={order.createdAt}
        save={(iso) => setOrderCreatedAt(order.orderId, iso)}
      />

      <span
        className="sheet-cell truncate"
        style={{ fontSize: 11, color: "var(--s-muted)", whiteSpace: "nowrap" }}
      >
        {order.note ?? `Dự kiến · ${order.createdAt}`}
      </span>

      <span
        className="sheet-cell"
        style={{ justifyContent: "center", gap: 6, borderRight: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button title="Chỉnh sửa LSX" onClick={onEdit} style={actionBtn}>
          <Pencil size={13} />
        </button>
      </span>
    </div>
  );
}

/** Tầng 2 — một mục của một phân loại: "Nhận thêu (Áo)". Ô số = SL kế hoạch. */
function StageRow({
  row,
  navId,
  open,
  checked,
  onToggle,
  onCheck,
  onDelete,
}: {
  row: GridRow;
  navId: string;
  open: boolean;
  checked: boolean;
  onToggle: () => void;
  onCheck: (on: boolean) => void;
  onDelete: () => void;
}) {
  const nav = useContext(NavCtx);

  // Đích của mọi mục là SL gốc của LSX; `target` của ô đã mang sẵn con số đó.
  const planTotal = row.cells.reduce((a, c) => a + c.target, 0);
  const short = row.stageId > 0 && planTotal > 0 && row.total < planTotal;

  const verb = row.muc === "SEW_OUT" || row.muc === "EMB_OUT" ? "gửi" : "nhận";
  // "Gửi may" mở ra chi tiết, ba mục kia mở thẳng ra đợt.
  const unit = row.muc === "SEW_OUT" ? "chi tiết" : "đợt";
  const note =
    row.stageId === 0
      ? "Chưa có mục"
      : row.children.length === 0
        ? row.muc === "SEW_OUT"
          ? "Chưa có chi tiết"
          : `Chưa ${verb}`
        : short
          ? `Thiếu ${planTotal - row.total} · ${row.children.length} ${unit}`
          : `Đủ gốc · ${row.children.length} ${unit}`;

  return (
    <div
      data-nav={navId}
      tabIndex={nav.tabIndex(navId, ROW_LEVEL)}
      onFocus={(e) => e.target === e.currentTarget && nav.point(navId, ROW_LEVEL)}
      onClick={() => {
        nav.point(navId, ROW_LEVEL);
        onToggle();
      }}
      className="sheet-row sheet-hover"
      style={{
        ["--row-bg" as string]: checked ? "#dbeccf" : ROW_BG.stage,
        cursor: "pointer",
        outline: "none",
      }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gap: 7, paddingLeft: INDENT.stage }}
      >
        <span onClick={(e) => e.stopPropagation()} style={{ display: "flex" }}>
          <RowCheckbox
            checked={checked}
            onChange={onCheck}
            label={`Chọn ${row.code} · ${row.categoryName} · ${row.mucLabel}`}
          />
        </span>
        <Chevron open={open} hidden={row.stageId === 0} onClick={onToggle} />
        <span
          className="truncate"
          style={{ fontWeight: 600, fontSize: 12.5, color: "#2f3a34" }}
        >
          {stageLabel(row)}
        </span>
      </span>

      <span className="sheet-cell" />

      {row.cells.map((c, i) => (
        <StageCell key={i} cell={c} col={i} />
      ))}

      <span
        className="sheet-cell sheet-cell--num"
        title={`Đã ${row.total} / gốc ${planTotal}`}
        style={{
          fontWeight: 700,
          color: short ? "var(--s-short)" : "var(--s-recv)",
          background: short ? "var(--s-plan-bg)" : "var(--s-recv-bg)",
        }}
      >
        {row.total || "–"}
      </span>

      <span className="sheet-cell" />

      <span
        className="sheet-cell truncate"
        style={{ fontSize: 11, color: "var(--s-muted)", whiteSpace: "nowrap" }}
      >
        {note}
      </span>

      <span
        className="sheet-cell"
        style={{ justifyContent: "center", gap: 6, borderRight: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <AddStageButton row={row} />
        <button
          title={
            row.stageId > 0
              ? `Xoá mục "${row.mucLabel}" của ${row.code} · ${row.categoryName}`
              : `Xoá phân loại "${row.categoryName}" của ${row.code}`
          }
          onClick={onDelete}
          style={{ ...actionBtn, color: "var(--s-short)" }}
        >
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

/**
 * Thêm một mục còn thiếu cho (LSX × phân loại) đang ở dòng này.
 * Dòng mục là bản ghi thật nên không tự có sẵn đủ bốn.
 */
function AddStageButton({ row }: { row: GridRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  /** Toạ độ theo viewport của menu; null = chưa đo được. */
  const [at, setAt] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menu phải TREO RA `body`, không nằm trong dòng.
  //
  // Mỗi `.sheet-row` là một stacking context riêng (z-index: 1), nên z-index của
  // menu chỉ có nghĩa BÊN TRONG dòng của nó — dòng nào đứng sau trong DOM cũng
  // vẽ đè lên, dù menu có z-index 30 hay 3000. Mà dòng lại nằm trong vùng cuộn
  // `overflow: auto`, nên menu còn bị cắt cụt khi dòng ở gần đáy bảng.
  // Portal + `position: fixed` gỡ cả hai.
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    // Ước lượng chiều cao: tiêu đề + mỗi mục một dòng. Không đủ chỗ bên dưới thì lật lên.
    const h = 34 + row.missingMucs.length * 30;
    const below = window.innerHeight - r.bottom;
    setAt({
      right: window.innerWidth - r.right,
      ...(below < h + 8
        ? { bottom: window.innerHeight - r.top + 4 }
        : { top: r.bottom + 4 }),
    });
  };

  useEffect(() => {
    if (!open) return;
    place();

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // Menu ở ngoài cây DOM của nút, phải hỏi cả hai ref.
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t))
        setOpen(false);
    };
    // `fixed` không cuộn theo bảng: cuộn một cái là menu lạc khỏi nút, nên đóng luôn.
    const onScroll = () => setOpen(false);

    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (row.missingMucs.length === 0) {
    // Giữ chỗ để các nút của mọi dòng luôn thẳng cột với nhau.
    return <span style={{ width: 26, flexShrink: 0 }} />;
  }

  const add = (type: MovementType) =>
    start(async () => {
      // Dòng giữ chỗ (stageId = 0) chưa có mục nào nên không có gì để chép.
      const source = row.stageId > 0 ? row.stageId : undefined;
      const res = await addStage(row.categoryId, type, source);
      setOpen(false);
      if (res.ok) {
        toast.success(`Đã thêm mục "${MUC_LABEL[type]}" cho ${row.categoryName}`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi khi thêm mục.");
    });

  return (
    <>
      <button
        ref={btnRef}
        title={`Thêm mục cho ${row.code} · ${row.categoryName}`}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        style={{ ...actionBtn, color: "var(--s-accent)" }}
      >
        <Plus size={14} />
      </button>

      {open &&
        at &&
        createPortal(
          <div
            ref={menuRef}
            className="sheet-scope"
            style={{
              position: "fixed",
              ...at,
              zIndex: 60,
              background: "#fff",
              border: "1px solid var(--s-card-line)",
              borderRadius: 4,
              boxShadow: "0 10px 30px rgba(31,42,36,.2)",
              padding: 5,
              minWidth: 150,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                textTransform: "uppercase",
                letterSpacing: ".4px",
                color: "var(--s-muted)",
                padding: "4px 8px 2px",
              }}
            >
              Thêm mục · {row.categoryName}
            </div>
            {row.missingMucs.map((m) => (
              <button
                key={m}
                onClick={() => add(m)}
                disabled={pending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  background: "none",
                  border: "none",
                  borderRadius: 3,
                  padding: "6px 8px",
                  fontSize: 12.5,
                  textAlign: "left",
                  cursor: pending ? "default" : "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#eef5e9")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <Plus size={12} style={{ color: "var(--s-accent)" }} />
                {MUC_LABEL[m]}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

/** Neo menu vào nút: luôn canh phải, thả xuống hoặc lật lên tuỳ chỗ trống. */
type MenuPos = { right: number; top?: number; bottom?: number };

const actionBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 3,
  background: "#fff",
  border: "1px solid var(--s-card-line)",
  color: "#5a635c",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

/** Checkbox có trạng thái "một phần" cho ô chọn-tất-cả ở header. */
function RowCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{
        width: 14,
        height: 14,
        flexShrink: 0,
        cursor: "pointer",
        accentColor: "var(--s-accent)",
      }}
    />
  );
}

/** Tầng 3 của "Gửi may" — chi tiết bán thành phẩm (định mức) + các đợt của nó. */
function PartBlock({
  row,
  navId,
  part,
  columns,
  open,
  onToggle,
}: {
  row: GridRow;
  navId: string;
  part: GridChild;
  columns: SizeColumn[];
  open: boolean;
  onToggle: () => void;
}) {
  const nav = useContext(NavCtx);
  return (
    <>
      <div
        data-nav={navId}
        tabIndex={nav.tabIndex(navId, ROW_LEVEL)}
        onFocus={(e) =>
          e.target === e.currentTarget && nav.point(navId, ROW_LEVEL)
        }
        onClick={() => {
          nav.point(navId, ROW_LEVEL);
          onToggle();
        }}
        className="sheet-row sheet-hover sheet-expand"
        style={{
          ["--row-bg" as string]: ROW_BG.part,
          cursor: "pointer",
          outline: "none",
        }}
      >
        <span
          className="sheet-cell sheet-freeze"
          style={{ gap: 7, paddingLeft: INDENT.part }}
        >
          <Chevron open={open} onClick={onToggle} />
          <span
            className="truncate"
            style={{ fontWeight: 500, fontSize: 12, color: "var(--s-ink-2)" }}
          >
            {part.label}
          </span>
        </span>

        <span className="sheet-cell" />

        {part.cells.map((c, i) => (
          <EditCell
            key={i}
            rowId={navId}
            cell={c}
            col={i}
            lit="var(--s-ink)"
            save={(q) => setPartTarget(part.partId!, c.orderSizeId!, q)}
          />
        ))}

        <span
          className="sheet-cell sheet-cell--num"
          style={{ fontWeight: 700, color: "var(--s-ink)" }}
        >
          {part.total || "–"}
        </span>

        <span className="sheet-cell" />
        <span
          className="sheet-cell truncate"
          style={{ fontSize: 11, color: "var(--s-muted)", whiteSpace: "nowrap" }}
        >
          {part.note}
        </span>
        <span className="sheet-cell" style={{ borderRight: "none" }} />
      </div>

      {open && (
        <div className="sheet-expand">
          {(part.batches ?? []).map((b) => (
            <BatchRow
              key={b.key}
              navId={`${navId}/${b.key}`}
              child={b}
              indent={INDENT.subBatch}
              bg={ROW_BG.subBatch}
            />
          ))}
          <AddBatchRow
            row={row}
            columns={columns}
            partId={part.partId}
            indent={INDENT.subBatch}
            bg={ROW_BG.subBatch}
            addId={`add:${navId}`}
          />
        </div>
      )}
    </>
  );
}

/** Dòng "đợt" — mỗi ô là một MovementItem, sửa được. */
function BatchRow({
  child,
  navId,
  indent,
  bg,
}: {
  child: GridChild;
  navId: string;
  indent: number;
  bg: string;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const remove = () =>
    start(async () => {
      const res = await deleteBatch(child.movementId!);
      setConfirming(false);
      if (res.ok) {
        toast.success("Đã xoá đợt");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi khi xoá.");
    });

  return (
    <div
      data-nav={navId}
      tabIndex={nav.tabIndex(navId, ROW_LEVEL)}
      onFocus={(e) => e.target === e.currentTarget && nav.point(navId, ROW_LEVEL)}
      onClick={() => nav.point(navId, ROW_LEVEL)}
      className="sheet-row sheet-hover sheet-expand"
      style={{
        ["--row-bg" as string]: bg,
        outline: "none",
        opacity: pending ? 0.4 : 1,
      }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gap: 7, paddingLeft: indent }}
      >
        <span style={{ width: 18, flexShrink: 0 }} />
        <span
          className="truncate"
          style={{ fontWeight: 500, fontSize: 12, color: "var(--s-ink-2)" }}
        >
          {child.label}
        </span>
      </span>

      <span className="sheet-cell" />

      {child.cells.map((c, i) => (
        <EditCell
          key={i}
          rowId={navId}
          cell={c}
          col={i}
          lit="var(--s-ink)"
          save={(q) =>
            setItemQty(child.movementId!, c.orderSizeId!, child.partId, q)
          }
        />
      ))}

      <span
        className="sheet-cell sheet-cell--num"
        style={{ fontWeight: 700, color: "var(--s-ink)" }}
      >
        {child.total || "–"}
      </span>

      <EditDateCell
        iso={child.dateIso!}
        label={child.dateLabel}
        save={(iso) => setMovementDate(child.movementId!, iso)}
      />

      <span
        className="sheet-cell truncate"
        style={{ fontSize: 11, color: "var(--s-muted)", whiteSpace: "nowrap" }}
      >
        {child.note ?? ""}
      </span>

      <span
        className="sheet-cell"
        style={{ justifyContent: "center", borderRight: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => setConfirming(true)}
          title="Xoá đợt này"
          style={{ ...actionBtn, border: "none", background: "none" }}
        >
          <Trash2 size={13} />
        </button>
      </span>

      <SheetProvider value>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          danger
          title={`Xoá "${child.label}"?`}
          description={`Đợt ngày ${child.dateLabel} và toàn bộ số lượng của nó sẽ mất. Không hoàn tác được.`}
          confirmLabel="Xoá"
          onConfirm={remove}
        />
      </SheetProvider>
    </div>
  );
}

/**
 * Ô của dòng mục: TỔNG CÁC ĐỢT bên dưới, đối chiếu với SL gốc của LSX.
 * Chỉ đọc — muốn đổi số thì sửa ở đúng cái đợt đã tạo ra nó.
 *
 * Xanh = đã đủ gốc, đỏ = còn thiếu, xám = chưa có đợt nào chạm tới size này.
 */
function StageCell({ cell, col }: { cell: Cell; col: number }) {
  const color =
    cell.orderSizeId == null || cell.value === 0
      ? "var(--s-dash)"
      : cell.value < cell.target
        ? "var(--s-short)"
        : "var(--s-recv)";

  const title =
    cell.orderSizeId != null && cell.target > 0
      ? `Đã ${cell.value} / gốc ${cell.target}${
          cell.value < cell.target ? ` · còn thiếu ${cell.target - cell.value}` : " · đủ"
        }`
      : undefined;

  return (
    <span
      className="sheet-cell sheet-cell--num"
      data-col={col}
      title={title}
      style={{ color }}
    >
      {cell.value || "–"}
    </span>
  );
}

/**
 * Ô ngày sửa tại chỗ. Dùng cho ngày tạo LSX (dòng LSX) và ngày của đợt.
 * Phải chặn click nổi lên, không thì bảng đóng/mở dòng.
 */
function EditDateCell({
  iso,
  label,
  save,
}: {
  iso: string;
  label: string;
  save: (iso: string) => Promise<CellResult>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const commit = (next: string) => {
    setEditing(false);
    if (!next || next === iso) return;
    start(async () => {
      const res = await save(next);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Lỗi khi lưu.");
    });
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        defaultValue={iso}
        className="sheet-cell--input"
        style={{ textAlign: "left", fontSize: 11.5 }}
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Bấm để sửa ngày"
      className="sheet-cell"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      style={{
        fontSize: 11.5,
        cursor: "pointer",
        whiteSpace: "nowrap",
        color: "var(--s-ink-2)",
        opacity: pending ? 0.4 : 1,
      }}
    >
      {label}
    </span>
  );
}

/**
 * Ô số sửa tại chỗ. Trạng thái "đang sửa" do bảng giữ, không phải ô — có thế
 * `Enter` mới bê được chế độ sửa sang ô kế mà không cần ô này biết ô kia là ai.
 * Ô của phân loại không khai báo size (orderSizeId null) chỉ đọc.
 */
function EditCell({
  cell,
  col,
  rowId,
  lit,
  save,
}: {
  cell: Cell;
  col: number;
  rowId: string;
  lit: string;
  save: (qty: number) => Promise<CellResult>;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [draft, setDraft] = useState("");
  /** Lượt sửa trước đó — để nhận ra đúng lúc ô vừa mở ra. */
  const [wasEditing, setWasEditing] = useState(false);
  const [pending, start] = useTransition();
  // Escape phải huỷ được, nhưng onBlur luôn chạy sau onKeyDown — dùng cờ để
  // onBlur biết là người dùng đã bỏ ý định sửa.
  const cancelled = useRef(false);
  // Enter vừa lưu vừa dời con trỏ, mà dời con trỏ lại làm ô này blur. Không có
  // cờ này thì cùng một lần gõ ghi xuống DB hai lượt.
  const committed = useRef(false);
  /** Chữ số vừa gõ để mở ô; đè lên giá trị cũ thay vì nối vào. */
  const seed = useRef<string | null>(null);

  const focused = nav.at(rowId, col);
  const editing = focused && nav.editing;

  /**
   * Mỗi lần ô mở ra là một lượt sửa mới: nạp lại nháp, xoá mọi cờ của lượt trước.
   *
   * Nạp ngay trong lúc render chứ KHÔNG trong `useEffect`. Bảng lấy nét cho ô
   * rồi `select()` bôi đen nội dung ở effect của nó; effect của con chạy trước
   * effect của cha, nhưng `setDraft` ở đó lại đẻ thêm một lượt render nữa — lượt
   * đó đổi value của input từ "" thành "600" SAU khi đã bôi đen, và trình duyệt
   * dụi sạch vùng chọn, đẩy con trỏ về cuối. Gõ tiếp là nối thêm vào số cũ
   * ("600" + "607" = "600607") thay vì thay nó.
   */
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) {
      cancelled.current = false;
      committed.current = false;
      setDraft(seed.current ?? (cell.value ? String(cell.value) : ""));
      seed.current = null;
    }
  }

  if (cell.orderSizeId == null) {
    return (
      <span
        className="sheet-cell sheet-cell--num"
        data-col={col}
        style={{ color: "var(--s-dash)" }}
      >
        –
      </span>
    );
  }

  const write = (next: number) => {
    if (next === cell.value) return;
    start(async () => {
      const res = await save(next);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Lỗi khi lưu.");
    });
  };

  const commit = () => {
    if (committed.current || cancelled.current) return;
    committed.current = true;

    const next = draft.trim() === "" ? 0 : Number(draft);
    if (!Number.isFinite(next) || next < 0) {
      toast.error("Số lượng không hợp lệ.");
      return;
    }
    write(next);
  };

  if (editing) {
    return (
      <input
        data-col={col}
        inputMode="numeric"
        value={draft}
        className="sheet-cell--input"
        // Dòng cha có onClick mở/gập; không chặn thì bấm vào ô là gập dòng lại.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const collapsed = el.selectionStart === el.selectionEnd;

          switch (e.key) {
            case "Escape":
              cancelled.current = true;
              nav.stopEditing();
              break;

            // Enter và ↑/↓ luôn chốt ô, kể cả khi không đi đâu được: hết bảng
            // thì lưu rồi đóng chế độ sửa.
            case "Enter":
              commit();
              nav.move("down", true);
              break;
            case "ArrowUp":
            case "ArrowDown":
              commit();
              nav.move(e.key === "ArrowUp" ? "up" : "down", true);
              break;

            // Hết bảng thì nhả Tab cho trình duyệt, đừng nhốt con trỏ trong ô.
            case "Tab":
              if (!nav.tab(e.shiftKey ? -1 : 1)) return;
              commit();
              break;

            // Chỉ nhảy khi con trỏ đã ở đầu/cuối ô; cướp phím vô điều kiện thì
            // không sửa được chữ số ở giữa. Và chỉ lưu khi thật sự rời ô — gõ →
            // ở ô cuối mà đã chốt thì những gì gõ tiếp sau đó rơi mất.
            case "ArrowLeft":
              if (!collapsed || el.selectionStart !== 0) return;
              if (nav.move("left", true)) commit();
              break;
            case "ArrowRight":
              if (!collapsed || el.selectionStart !== el.value.length) return;
              if (nav.move("right", true)) commit();
              break;

            default:
              return;
          }
          e.preventDefault();
          e.stopPropagation();
        }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={nav.tabIndex(rowId, col)}
      title="Bấm để sửa"
      className="sheet-cell sheet-cell--num"
      data-col={col}
      data-focused={focused || undefined}
      onClick={(e) => {
        e.stopPropagation();
        nav.open(rowId, col);
      }}
      onKeyDown={(e) => {
        // Ctrl+Delete là lệnh xoá dòng của bảng, không phải lệnh của ô.
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        if (e.key === "Enter") nav.open(rowId, col);
        else if (e.key === "Delete" || e.key === "Backspace") write(0);
        else if (e.key.length === 1 && e.key >= "0" && e.key <= "9") {
          seed.current = e.key;
          nav.open(rowId, col);
        } else return;

        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        cursor: "pointer",
        outline: "none",
        color: cellColor(cell, lit),
        opacity: pending ? 0.4 : 1,
      }}
    >
      {cell.value || "–"}
    </span>
  );
}

/** Ô nhập số trong các dòng "thêm mới". */
function NumInput({
  disabled,
  value,
  onChange,
  autoFocus,
  col,
}: {
  disabled: boolean;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  col: number;
}) {
  if (disabled) {
    return (
      <span
        className="sheet-cell sheet-cell--num"
        data-col={col}
        style={{ color: "var(--s-dash)" }}
      >
        –
      </span>
    );
  }
  return (
    <input
      autoFocus={autoFocus}
      data-col={col}
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
      className="sheet-cell--input"
      style={{ boxShadow: "inset 0 0 0 1px var(--s-card-line)" }}
    />
  );
}

/** Dòng "＋ Thêm ..." lúc chưa mở — bấm vào mới hiện các ô nhập. */
function AddTrigger({
  label,
  indent,
  bg,
  cols,
  onOpen,
}: {
  label: string;
  indent: number;
  bg: string;
  cols: number;
  onOpen: () => void;
}) {
  return (
    <div
      className="sheet-row sheet-hover"
      onClick={onOpen}
      style={{ ["--row-bg" as string]: bg, cursor: "pointer" }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gap: 7, paddingLeft: indent, color: "var(--s-faint)" }}
      >
        <span style={{ width: 18, flexShrink: 0 }} />
        <span style={{ fontSize: 12 }}>＋ {label}</span>
      </span>
      {/* Một ô trải hết phần còn lại: dòng này không có số nào để canh cột. */}
      <span
        className="sheet-cell"
        style={{ gridColumn: `2 / ${cols + 1}`, borderRight: "none" }}
      />
    </div>
  );
}

/** Nút huỷ ở cột cuối của dòng nhập. */
function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <span
      className="sheet-cell"
      style={{ justifyContent: "center", borderRight: "none" }}
    >
      <button
        onClick={onClick}
        title="Huỷ"
        style={{ ...actionBtn, border: "none", background: "none" }}
      >
        <X size={13} />
      </button>
    </span>
  );
}

/**
 * Thêm một chi tiết mới (kèm định mức) vào phân loại.
 * Trạng thái mở do bảng giữ, để phím `a` với tới được.
 */
function AddPartRow({
  row,
  columns,
  addId,
}: {
  row: GridRow;
  columns: SizeColumn[];
  addId: string;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [name, setName] = useState("");
  const [qty, setQty] = useState<string[]>(() => columns.map(() => ""));
  const [pending, start] = useTransition();

  const n = columns.length;
  const open = nav.addOpen === addId;
  const close = () => {
    nav.setAddOpen(null);
    setName("");
    setQty(columns.map(() => ""));
  };

  if (!open) {
    return (
      <AddTrigger
        label="Thêm chi tiết…"
        indent={INDENT.part}
        bg={ROW_BG.part}
        cols={n + 6}
        onOpen={() => nav.setAddOpen(addId)}
      />
    );
  }

  const submit = () => {
    if (!name.trim()) {
      toast.error("Nhập tên chi tiết.");
      return;
    }
    const targets = row.cells
      .map((c, i) => ({ orderSizeId: c.orderSizeId, qty: Number(qty[i] || 0) }))
      .filter((t): t is { orderSizeId: number; qty: number } => t.orderSizeId != null);

    start(async () => {
      const res = await addPart({
        categoryId: row.categoryId,
        name: name.trim(),
        targets,
      });
      if (res.ok) {
        toast.success(`Đã thêm chi tiết "${name.trim()}"`);
        close();
        router.refresh();
      } else toast.error(res.error ?? "Lỗi khi lưu.");
    });
  };

  const total = qty.reduce((a, v) => a + (Number(v) || 0), 0);

  return (
    <div
      className="sheet-row sheet-expand"
      style={{
        ["--row-bg" as string]: ROW_BG.part,
        opacity: pending ? 0.5 : 1,
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") close();
      }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gap: 7, paddingLeft: INDENT.part }}
      >
        <Plus size={14} style={{ flexShrink: 0, color: "var(--s-accent)" }} />
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên chi tiết…"
          style={{
            flex: 1,
            minWidth: 0,
            background: "#fff",
            border: "1px solid var(--s-card-line)",
            borderRadius: 3,
            padding: "3px 6px",
            fontSize: 12.5,
            outline: "none",
          }}
        />
      </span>

      <span className="sheet-cell" />

      {row.cells.map((c, i) => (
        <NumInput
          key={i}
          col={i}
          disabled={c.orderSizeId == null}
          value={qty[i]}
          onChange={(v) => setQty((s) => s.map((x, j) => (j === i ? v : x)))}
        />
      ))}

      <span
        className="sheet-cell sheet-cell--num"
        style={{ color: "var(--s-muted)" }}
      >
        {total || "–"}
      </span>
      <span className="sheet-cell" />
      <span
        className="sheet-cell"
        style={{ fontSize: 11, color: "var(--s-muted)", whiteSpace: "nowrap" }}
      >
        Định mức · Enter lưu
      </span>
      <CancelBtn onClick={close} />
    </div>
  );
}

/** Thêm một đợt gửi/nhận mới. */
function AddBatchRow({
  row,
  columns,
  partId,
  indent,
  bg,
  addId,
}: {
  row: GridRow;
  columns: SizeColumn[];
  partId: number | null;
  indent: number;
  bg: string;
  addId: string;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<string[]>(() => columns.map(() => ""));
  const [pending, start] = useTransition();

  const n = columns.length;
  const open = nav.addOpen === addId;
  const close = () => {
    nav.setAddOpen(null);
    setDate(today());
    setNote("");
    setQty(columns.map(() => ""));
  };

  const isReceive = row.muc === "SEW_IN" || row.muc === "EMB_IN";

  if (!open) {
    return (
      <AddTrigger
        label={isReceive ? "Thêm đợt nhận…" : "Thêm đợt gửi…"}
        indent={indent}
        bg={bg}
        cols={n + 6}
        onOpen={() => nav.setAddOpen(addId)}
      />
    );
  }

  const submit = () => {
    const quantities = row.cells
      .map((c, i) => ({ orderSizeId: c.orderSizeId, qty: Number(qty[i] || 0) }))
      .filter((t): t is { orderSizeId: number; qty: number } => t.orderSizeId != null);

    start(async () => {
      const res = await addBatch({
        orderId: row.orderId,
        type: row.muc,
        date,
        note,
        partId,
        quantities,
      });
      if (res.ok) {
        toast.success("Đã thêm đợt mới");
        close();
        router.refresh();
      } else toast.error(res.error ?? "Lỗi khi lưu.");
    });
  };

  const total = qty.reduce((a, v) => a + (Number(v) || 0), 0);
  // Con trỏ nhảy thẳng vào ô số đầu tiên nhập được; ngày đã có sẵn hôm nay.
  const firstEditable = row.cells.findIndex((c) => c.orderSizeId != null);

  return (
    <div
      className="sheet-row sheet-expand"
      style={{ ["--row-bg" as string]: bg, opacity: pending ? 0.5 : 1 }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") close();
      }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gap: 7, paddingLeft: indent, color: "var(--s-ink-2)" }}
      >
        <Plus size={14} style={{ flexShrink: 0, color: "var(--s-accent)" }} />
        <span style={{ fontSize: 12 }}>Đợt mới</span>
      </span>

      <span className="sheet-cell" />

      {row.cells.map((c, i) => (
        <NumInput
          key={i}
          col={i}
          autoFocus={i === firstEditable}
          disabled={c.orderSizeId == null}
          value={qty[i]}
          onChange={(v) => setQty((s) => s.map((x, j) => (j === i ? v : x)))}
        />
      ))}

      <span
        className="sheet-cell sheet-cell--num"
        style={{ color: "var(--s-muted)" }}
      >
        {total || "–"}
      </span>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        title="Ngày của đợt"
        className="sheet-cell--input"
        style={{
          textAlign: "left",
          fontSize: 11.5,
          boxShadow: "inset 0 0 0 1px var(--s-card-line)",
        }}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú · Enter lưu"
        className="sheet-cell--input"
        style={{
          textAlign: "left",
          fontSize: 11.5,
          boxShadow: "inset 0 0 0 1px var(--s-card-line)",
        }}
      />
      <CancelBtn onClick={close} />
    </div>
  );
}
