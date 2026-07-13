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
  addCustomStage,
  addPart,
  addStage,
  deleteBatch,
  deleteRows,
  renameStage,
  setItemQty,
  setMovementDate,
  setMovementNote,
  setOrderCreatedAt,
  setOrderNote,
  setPartTarget,
  type CellResult,
} from "@/app/actions/grid";
import OrderFormModal from "@/components/forms/OrderFormModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { SheetProvider } from "@/components/ui/sheet-context";
import { isComposing, useHotkeys } from "@/lib/hotkeys";
import { CALC_CHARS, CALC_STRIP, calcQty } from "@/lib/calc";
import {
  COL_NAME,
  buildNav,
  colDate,
  colNote,
  colTotal,
  collapseOrOut,
  depthOf,
  expandOrIn,
  indexOfRow,
  isEditable,
  moveHorizontal,
  moveTab,
  moveVertical,
  reanchor,
  rowAt,
  selectableRange,
  type Cursor,
  type NavRow,
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
  /** Số cột size — các ô đuôi (Tổng/Ngày/Ghi chú) đánh số tiếp từ đây. */
  n: number;
  at: (id: string, col: number) => boolean;
  editing: boolean;
  tabIndex: (id: string, col: number) => 0 | -1;
  point: (id: string, col: number) => void;
  open: (id: string, col: number) => void;
  stopEditing: () => void;
  /**
   * Có dòng nào đang được tick không. Ô số cần biết để nhường phím Delete: tick
   * một dòng rồi bấm Delete là muốn xoá DÒNG, dù con trỏ đang đậu ở ô số nào.
   */
  hasSelection: boolean;
  /** Dòng "+ Thêm…" nào đang mở; đúng một cái trong cả bảng. */
  addOpen: string | null;
  setAddOpen: (id: string | null) => void;
  /**
   * Thả con trỏ vào một ô NGAY KHI dòng của nó xuất hiện. Dòng vừa tạo chưa có
   * trong `nav` — dữ liệu còn đang trên đường về từ `router.refresh()` — nên
   * `point()` thẳng vào nó sẽ bị `reanchor` kéo ngược về dòng cha.
   */
  focusOnArrive: (c: Cursor) => void;
  /** Trả về false nghĩa là hết đường — caller tự quyết làm gì tiếp. */
  move: (dir: "up" | "down" | "left" | "right", sticky: boolean) => boolean;
  tab: (dir: 1 | -1) => boolean;
};

const NavCtx = createContext<NavApi>({
  n: 0,
  at: () => false,
  editing: false,
  tabIndex: () => -1,
  point: () => {},
  open: () => {},
  stopEditing: () => {},
  hasSelection: false,
  addOpen: null,
  setAddOpen: () => {},
  focusOnArrive: () => {},
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
  /** Dòng được tick, khoá theo id điều hướng — nhiều đợt dùng chung một `rowKey`. */
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  /** Dòng đang chờ xác nhận xoá; null = không có hộp thoại nào. */
  const [pendingDelete, setPendingDelete] = useState<NavRow[] | null>(null);
  const [deleting, startDelete] = useTransition();
  const [exporting, startExport] = useTransition();
  const router = useRouter();

  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState<string | null>(null);
  /** Ô đang chờ dòng của nó hiện ra — xem `focusOnArrive`. */
  const [pendingFocus, setPendingFocus] = useState<Cursor | null>(null);
  /** Neo của dải Shift+↑/↓; đặt lại mỗi khi tick bằng Space. */
  const anchor = useRef<string | null>(null);

  /** Đúng những dòng đang nhìn thấy, đã trải phẳng. */
  const nav = useMemo(
    () => buildNav(orders, openOrders, openRows, openParts),
    [orders, openOrders, openRows, openParts]
  );

  const allRows = useMemo(() => orders.flatMap((o) => o.rows), [orders]);
  const rowByKey = useMemo(
    () => new Map(allRows.map((r) => [r.key, r])),
    [allRows]
  );

  // Mở sẵn LSX đầu tiên: bảng mở ra mà mọi thứ đều gập lại thì không thấy được
  // hình dạng của dữ liệu.
  useEffect(() => {
    setOpenOrders((s) =>
      Object.keys(s).length > 0 || orders.length === 0
        ? s
        : { [orders[0].key]: true }
    );
  }, [orders]);

  // Đổi trang / đổi bộ lọc thì bỏ chọn — id cũ không còn ứng với dòng nào.
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

  // Dòng vừa tạo đã về tới nơi: thả con trỏ vào ô đầu tiên của nó, y như Excel
  // đưa con trỏ xuống dòng mới ngay sau khi chèn.
  useEffect(() => {
    if (!pendingFocus || !rowAt(nav, pendingFocus.id)) return;
    setCursor(pendingFocus);
    setEditing(false);
    setPendingFocus(null);
  }, [nav, pendingFocus]);

  /**
   * Chọn dòng chỉ tính trên những dòng đang HIỆN. Gập một mục lại là bỏ tick các
   * đợt bên trong nó — số trên thanh "đã chọn" phải luôn đếm đúng những gì mắt
   * nhìn thấy, chứ không phải một tập ngầm mà bấm Xoá mới lòi ra.
   */
  const selectedRows = nav.filter((r) => selected[r.id]);
  const selectableCount = nav.filter((r) => r.selectable).length;

  /** Dòng giữ chỗ không có mục nào nên không có gì để xuất; đợt cũng không xuất riêng. */
  const runExport = (targets: NavRow[]) =>
    startExport(async () => {
      const stageIds = targets
        .map((r) => r.target)
        .filter((t) => t?.kind === "stage" && t.stageId > 0)
        .map((t) => (t as { stageId: number }).stageId);

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

  const runDelete = (targets: NavRow[]) =>
    startDelete(async () => {
      const stages = targets.filter((r) => r.target?.kind === "stage");
      // Xoá một mục cuốn theo mọi đợt của nó. Đợt nào nằm dưới một mục cũng đang
      // bị xoá thì bỏ ra, không thì lượt xoá thứ hai đâm vào bản ghi đã biến mất.
      const batches = targets.filter(
        (r) =>
          r.target?.kind === "batch" &&
          !stages.some((s) => r.id.startsWith(`${s.id}/`))
      );

      const errors: string[] = [];

      for (const b of batches) {
        const res = await deleteBatch(
          (b.target as { movementId: number }).movementId
        );
        if (!res.ok) errors.push(res.error ?? "Lỗi khi xoá đợt.");
      }

      let summary: { stages?: number; categories?: number; orders?: number } | undefined;
      if (stages.length > 0) {
        // Mỗi dòng là một đích riêng: dòng mục → xoá mục đó; dòng giữ chỗ → xoá
        // phân loại.
        const res = await deleteRows(
          stages.map((r) => {
            const t = r.target as { stageId: number; categoryId: number };
            return { stageId: t.stageId, categoryId: t.categoryId };
          })
        );
        if (res.ok) summary = res.summary;
        else errors.push(res.error ?? "Lỗi khi xoá.");
      }

      setPendingDelete(null);

      if (errors.length > 0) {
        toast.error(errors[0]);
        router.refresh();
        return;
      }

      setSelected({});
      const parts = [
        summary?.stages ? `${summary.stages} mục` : null,
        summary?.categories ? `${summary.categories} phân loại` : null,
        summary?.orders ? `${summary.orders} LSX rỗng` : null,
        batches.length ? `${batches.length} đợt` : null,
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
    // Cột A không có phần tử riêng: nét đậu trên chính `.sheet-row`, và CSS kéo
    // khung ô từ dòng xuống `.sheet-freeze`. Trừ lúc đang đổi tên mục — khi ấy
    // ô nhập mới là chỗ phải lấy nét, không thì gõ vào hư không.
    const el =
      cursor.col === COL_NAME
        ? (row?.querySelector<HTMLElement>("[data-name-input]") ??
          (row as HTMLElement | null))
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

      if (el instanceof HTMLInputElement) {
        // Ô mở ra bằng chính một ký tự vừa gõ (`data-seed`) thì ký tự ấy LÀ nội
        // dung mới — bôi đen nó là ký tự kế tiếp đè mất, gõ "591" chỉ còn "91".
        // Mở bằng Enter hay bằng chuột thì ngược lại: bôi đen số cũ để gõ đè.
        if (el.dataset.seed) el.setSelectionRange(el.value.length, el.value.length);
        else el.select();
      }
    }

    if (cursor.col !== COL_NAME && placeBand("edit", el))
      setAttr("data-editcol", String(cursor.col));
    else setAttr("data-editcol", null);
  }, [cursor, editing, nav, addOpen]);

  /**
   * Dời con trỏ. Chế độ sửa chỉ theo sang ô mới nếu ô đó GÕ ĐƯỢC — mũi tên giờ
   * đi qua cả ô chỉ đọc, nên nó phải tự tắt chế độ sửa khi đậu vào một ô như thế
   * thay vì mở ra một <input> trên con số không sửa được.
   */
  const goTo = (next: Cursor | null, keepEditing: boolean) => {
    if (!next) return false;
    setCursor(next);
    setEditing(keepEditing && isEditable(rowAt(nav, next.id), next.col));
    return true;
  };

  const api: NavApi = {
    n,
    editing,
    at: (id, col) => cursor?.id === id && cursor.col === col,
    // Roving tabindex: cả bảng chỉ có đúng một điểm dừng cho phím Tab của trình
    // duyệt. Chưa trỏ đâu thì đó là dòng đầu tiên.
    tabIndex: (id, col) =>
      cursor
        ? cursor.id === id && cursor.col === col
          ? 0
          : -1
        : nav[0]?.id === id && col === COL_NAME
          ? 0
          : -1,
    point: (id, col) =>
      setCursor((c) => (c && c.id === id && c.col === col ? c : { id, col })),
    open: (id, col) => {
      setCursor({ id, col });
      setEditing(true);
    },
    stopEditing: () => setEditing(false),
    hasSelection: selectedRows.length > 0,
    addOpen,
    setAddOpen,
    focusOnArrive: setPendingFocus,
    move: (dir, keepEditing) => {
      if (!cursor) return false;
      if (dir === "up" || dir === "down") {
        const d = dir === "down" ? 1 : -1;
        if (goTo(moveVertical(nav, cursor, d), keepEditing)) return true;
        // Hết bảng: đứng yên và đóng chế độ sửa — Enter phải luôn "chốt" ô.
        setEditing(false);
        return false;
      }
      // Ngang thì hết đường là đứng yên, giữ nguyên chế độ sửa: người dùng chỉ
      // gõ → thêm một nhát ở ô cuối, không có ý bỏ ô.
      const d = dir === "right" ? 1 : -1;
      return goTo(moveHorizontal(nav, cursor, d), keepEditing);
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

  /** Xoá dòng: ưu tiên các dòng đã tick, không có thì xoá đúng dòng đang trỏ. */
  const askDelete = (here: NavRow | undefined) => {
    if (selectedRows.length > 0) {
      setPendingDelete(selectedRows);
      return true;
    }
    if (here?.selectable) {
      setPendingDelete([here]);
      return true;
    }
    return false;
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

    const here = cursor ? rowAt(nav, cursor.id) : undefined;

    if (e.ctrlKey || e.metaKey) {
      switch (k) {
        case "a":
        case "A":
          // Chỉ những dòng đang hiện — xem ghi chú ở `selectedRows`.
          setSelected(
            Object.fromEntries(
              nav.filter((r) => r.selectable).map((r) => [r.id, true])
            )
          );
          break;

        case "Delete":
        case "Backspace":
          if (!askDelete(here)) return;
          break;

        // Gập/mở cây. Mũi tên trần giờ dùng để đi giữa các ô nên không kiêm được
        // việc này nữa; Ctrl+←/→ chạy được ở BẤT KỲ cột nào, không bắt phải lết
        // con trỏ về cột A trước.
        case "ArrowLeft":
        case "ArrowRight": {
          if (!cursor) return;
          const act =
            k === "ArrowRight"
              ? expandOrIn(nav, cursor)
              : collapseOrOut(nav, cursor);
          if (!act) return;
          if (act.kind === "goto") setCursor(act.cursor);
          else setOpen(act.id, act.kind === "expand");
          setEditing(false);
          break;
        }

        default:
          return;
      }
      e.preventDefault();
      return;
    }
    if (e.altKey) return;

    if (!cursor) {
      // Phím di chuyển đầu tiên thả con trỏ vào bảng.
      if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Home" && k !== "End")
        return;
      setCursor({ id: nav[k === "End" ? nav.length - 1 : 0].id, col: COL_NAME });
      e.preventDefault();
      return;
    }

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
          setCursor({ id: nav[j].id, col: cursor.col });
          setEditing(false);
          const ids = selectableRange(nav, anchor.current, nav[j].id);
          setSelected(Object.fromEntries(ids.map((x) => [x, true])));
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
      // Mũi tên chỉ làm một việc: đi giữa các ô, qua mọi dòng và mọi ô — kể cả ô
      // chỉ đọc. Ô chỉ đọc đậu được nhưng không gõ vào được, như ô đã khoá trên
      // một sheet Excel.
      case "ArrowDown":
      case "ArrowUp":
      case "ArrowLeft":
      case "ArrowRight":
        anchor.current = null;
        api.move(
          k === "ArrowDown"
            ? "down"
            : k === "ArrowUp"
              ? "up"
              : k === "ArrowRight"
                ? "right"
                : "left",
          false
        );
        break;

      // Ở ô gõ được thì ô đã tự mở sửa và chặn phím; tới được đây nghĩa là con
      // trỏ đang ở cột A hoặc ở một ô chỉ đọc.
      case "Enter":
        if (cursor.col !== COL_NAME || !here?.expandable) return;
        setOpen(here.id, !here.expanded);
        break;

      // Đổi tên mục. Cột A không nhả Enter được (Enter ở đó là gập/mở cây), nên
      // dùng F2 — phím sửa ô của Excel. Nháy đúp vào nhãn cũng mở ra.
      case "F2":
        if (!isEditable(here, COL_NAME)) return;
        setCursor({ id: here!.id, col: COL_NAME });
        setEditing(true);
        break;

      // Ô gõ được nuốt Delete để đặt số về 0. Còn ở cột A hay ô chỉ đọc thì Delete
      // chẳng có số nào để xoá — nên nó xoá cả dòng.
      case "Delete":
      case "Backspace":
        if (!askDelete(here)) return;
        break;

      // Thêm đợt / thêm chi tiết, tuỳ dòng đang trỏ. Đứng ở một đợt thì thêm
      // vào đúng nhóm chứa nó — đang gõ dở các đợt thì chẳng ai muốn leo ngược
      // lên dòng cha rồi mới bấm được. Ở dòng LSX thì không có gì để thêm.
      case "a":
      case "A": {
        if (!here || here.kind === "order") return;
        const target = here.kind === "batch" ? here.parentId! : here.id;
        // Dòng giữ chỗ chưa có mục nào thì không có gì để thêm vào.
        if (!rowAt(nav, target)?.expandable) return;
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
        // Dòng LSX và dòng chi tiết không tick được. Vẫn nuốt Space để trang không nhảy.
        if (here?.selectable) {
          setSelected((s) => ({ ...s, [here.id]: !s[here.id] }));
          anchor.current = here.id;
        } else if (k !== " ") return;
        break;

      case "Home":
      case "End":
        anchor.current = null;
        setCursor({
          id: nav[k === "End" ? nav.length - 1 : 0].id,
          col: COL_NAME,
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
              allChecked={
                selectableCount > 0 && selectedRows.length === selectableCount
              }
              someChecked={selectedRows.length > 0}
              onToggleAll={(on) =>
                setSelected(
                  on
                    ? Object.fromEntries(
                        nav.filter((r) => r.selectable).map((r) => [r.id, true])
                      )
                    : {}
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
                            checked={!!selected[rowId]}
                            onToggle={() => row.stageId > 0 && toggle(rowId, !open)}
                            onCheck={(on) =>
                              setSelected((s) => ({ ...s, [rowId]: on }))
                            }
                            // Bấm thùng rác của một dòng là nhắm vào ĐÚNG dòng đó,
                            // dù đang có dòng khác được tick.
                            onDelete={() => {
                              const r = rowAt(nav, rowId);
                              if (r) setPendingDelete([r]);
                            }}
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
                                      open={!!openParts[`${rowId}/${part.key}`]}
                                      onToggle={() =>
                                        toggle(
                                          `${rowId}/${part.key}`,
                                          !openParts[`${rowId}/${part.key}`]
                                        )
                                      }
                                      selected={selected}
                                      onCheck={(id, on) =>
                                        setSelected((s) => ({ ...s, [id]: on }))
                                      }
                                    />
                                  ))
                                : row.children.map((child) => {
                                    const id = `${rowId}/${child.key}`;
                                    return (
                                      <BatchRow
                                        key={child.key}
                                        navId={id}
                                        child={child}
                                        indent={INDENT.batch}
                                        bg={ROW_BG.batch}
                                        checked={!!selected[id]}
                                        onCheck={(on) =>
                                          setSelected((s) => ({ ...s, [id]: on }))
                                        }
                                      />
                                    );
                                  })}

                              {row.muc === "SEW_OUT" ? (
                                <AddPartRow
                                  row={row}
                                  columns={columns}
                                  addId={`add:${rowId}`}
                                />
                              ) : (
                                <AddBatchRow
                                  row={row}
                                  partId={null}
                                  indent={INDENT.batch}
                                  bg={ROW_BG.batch}
                                  addId={`add:${rowId}`}
                                  parentId={rowId}
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
            exportable={selectedRows.filter(isStageRow).length}
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
            description={describeDelete(pendingDelete, rowByKey)}
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

/** Một mục thật (đã có Stage), khác với dòng giữ chỗ của phân loại chưa có mục. */
function isStageRow(r: NavRow): boolean {
  return r.target?.kind === "stage" && r.target.stageId > 0;
}

function isCategoryRow(r: NavRow): boolean {
  return r.target?.kind === "stage" && r.target.stageId === 0;
}

function deleteTitle(rows: NavRow[] | null): string {
  if (!rows || rows.length === 0) return "Xoá?";
  if (rows.length > 1) return `Xoá ${rows.length} dòng đã chọn?`;

  const t = rows[0].target;
  if (t?.kind === "batch") return `Xoá đợt "${t.label}"?`;
  if (isCategoryRow(rows[0])) return "Xoá phân loại chưa có mục?";
  return `Xoá mục "${t?.label ?? ""}"?`;
}

/** Nói rõ cái gì mất và cái gì ở lại — đây là chỗ dễ hiểu nhầm nhất. */
function describeDelete(
  rows: NavRow[] | null,
  rowByKey: Map<string, GridRow>
): string {
  if (!rows || rows.length === 0) return "";

  const labels = rows.map((r) => r.target?.label ?? "");
  const list =
    labels.length <= 3 ? labels.join("; ") : `${labels.slice(0, 3).join("; ")}…`;

  const stageRows = rows.filter(isStageRow);
  const catRows = rows.filter(isCategoryRow);
  const batchRows = rows.filter((r) => r.target?.kind === "batch");
  const hasSewOut = stageRows.some(
    (r) => rowByKey.get(r.rowKey)?.muc === "SEW_OUT"
  );

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
  if (batchRows.length > 0) {
    what.push(
      `${batchRows.length === 1 ? "Đợt" : `${batchRows.length} đợt`} bị xoá kèm toàn bộ số lượng của nó; mục chứa nó giữ nguyên.`
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
      {/* "dòng" chứ không phải "mục": dải chọn giờ ôm cả đợt lẫn mục. */}
      <span>
        Đã chọn <b>{rowCount}</b> dòng
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
        <Trash2 size={13} /> {busy ? "Đang xoá…" : "Xoá dòng đã chọn"}
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
          label="Chọn tất cả dòng đang hiện"
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
        data-col={colTotal(n)}
        style={{ gridColumn: TOTAL, gridRow: both, fontWeight: 700 }}
      >
        Tổng
      </span>
      <span
        className="sheet-cell"
        data-col={colDate(n)}
        style={{ gridColumn: TOTAL + 1, gridRow: both }}
      >
        <SortHead sortKey="createdAt">Ngày</SortHead>
      </span>
      <span
        className="sheet-cell"
        data-col={colNote(n)}
        style={{ gridColumn: TOTAL + 2, gridRow: both }}
      >
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
      tabIndex={nav.tabIndex(navId, COL_NAME)}
      onFocus={(e) => e.target === e.currentTarget && nav.point(navId, COL_NAME)}
      onClick={() => {
        nav.point(navId, COL_NAME);
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
        <ReadCell
          key={i}
          rowId={navId}
          col={i}
          color={v ? "var(--s-plan)" : "var(--s-dash)"}
          title="SL gốc của LSX · sửa trong form LSX"
        >
          {v || "–"}
        </ReadCell>
      ))}

      <ReadCell
        rowId={navId}
        col={colTotal(nav.n)}
        style={{
          fontWeight: 700,
          color: "var(--s-plan)",
          background: "var(--s-plan-bg)",
        }}
      >
        {order.planTotal || "–"}
      </ReadCell>

      <EditDateCell
        rowId={navId}
        col={colDate(nav.n)}
        iso={order.createdAtIso}
        label={order.createdAt}
        save={(iso) => setOrderCreatedAt(order.orderId, iso)}
      />

      <EditTextCell
        rowId={navId}
        col={colNote(nav.n)}
        value={order.note ?? ""}
        placeholder="Ghi chú LSX…"
        save={(text) => setOrderNote(order.orderId, text)}
      />

      <span
        className="sheet-cell"
        style={{ justifyContent: "center", gap: 6, borderRight: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <AddStageButton
          groups={stageGroups(order.rows)}
          title={`Thêm mục cho ${order.code}`}
        />
        <button title="Chỉnh sửa LSX" onClick={onEdit} style={actionBtn}>
          <Pencil size={13} />
        </button>
      </span>
    </div>
  );
}

/** Tầng 2 — một mục của một phân loại: "Nhận thêu (Áo)". Ô số = tổng các đợt. */
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
  // "Gửi may" mở ra chi tiết, các mục khác mở thẳng ra đợt.
  const unit = row.muc === "SEW_OUT" ? "chi tiết" : "đợt";
  const empty =
    row.muc === "SEW_OUT"
      ? "Chưa có chi tiết"
      : row.muc
        ? `Chưa ${verb}`
        : "Chưa có đợt";
  const note =
    row.stageId === 0
      ? "Chưa có mục"
      : row.children.length === 0
        ? empty
        : short
          ? `Thiếu ${planTotal - row.total} · ${row.children.length} ${unit}`
          : `Đủ gốc · ${row.children.length} ${unit}`;

  return (
    <div
      data-nav={navId}
      tabIndex={nav.tabIndex(navId, COL_NAME)}
      onFocus={(e) => e.target === e.currentTarget && nav.point(navId, COL_NAME)}
      onClick={() => {
        nav.point(navId, COL_NAME);
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
        <StageName row={row} navId={navId} />
      </span>

      <span className="sheet-cell" />

      {row.cells.map((c, i) => (
        <StageCell key={i} cell={c} col={i} rowId={navId} />
      ))}

      <ReadCell
        rowId={navId}
        col={colTotal(nav.n)}
        title={`Đã ${row.total} / gốc ${planTotal}`}
        style={{
          fontWeight: 700,
          color: short ? "var(--s-short)" : "var(--s-recv)",
          background: short ? "var(--s-plan-bg)" : "var(--s-recv-bg)",
        }}
      >
        {row.total || "–"}
      </ReadCell>

      <ReadCell rowId={navId} col={colDate(nav.n)} text>
        {""}
      </ReadCell>

      <ReadCell
        rowId={navId}
        col={colNote(nav.n)}
        text
        color="var(--s-muted)"
        style={{ fontSize: 11 }}
      >
        {note}
      </ReadCell>

      <span
        className="sheet-cell"
        style={{ justifyContent: "center", gap: 6, borderRight: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <AddStageButton
          groups={stageGroups([row])}
          title={`Thêm mục cho ${row.code} · ${row.categoryName}`}
        />
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
 * Tên mục — ô chữ của cột A.
 *
 * Mục hệ thống: sửa ở đây là đặt một nhãn ĐÈ LÊN nhãn mặc định; vai trò của nó
 * trong luồng sản xuất (và do đó tiến độ, nhật ký, xuất file) không đổi. Xoá
 * trắng là trả về nhãn mặc định.
 * Mục tự do: cái tên này là tất cả những gì nó có, nên không được để trống.
 *
 * Chỉ TÊN sửa được, "(Áo)" phía sau là phân loại — thứ thuộc về một cây khác.
 */
function StageName({ row, navId }: { row: GridRow; navId: string }) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [draft, setDraft] = useState("");
  const [wasEditing, setWasEditing] = useState(false);
  const [pending, start] = useTransition();
  const cancelled = useRef(false);
  const committed = useRef(false);

  // Dòng giữ chỗ chưa có mục nào thì chưa có gì để đặt tên.
  const editable = row.stageId > 0;
  const editing = editable && nav.at(navId, COL_NAME) && nav.editing;

  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) {
      cancelled.current = false;
      committed.current = false;
      setDraft(row.mucLabel);
    }
  }

  const commit = () => {
    if (committed.current || cancelled.current) return;
    committed.current = true;
    if (draft.trim() === row.mucLabel.trim()) return;
    start(async () => {
      const res = await renameStage(row.stageId, draft);
      if (res.ok) router.refresh();
      else {
        toast.error(res.error ?? "Lỗi khi lưu.");
        // Tên bị từ chối (mục tự do để trống): kéo lại giá trị cũ từ server,
        // đừng để ô hiện một cái tên chưa bao giờ được ghi xuống.
        router.refresh();
      }
    });
  };

  if (editing) {
    return (
      <input
        data-name-input=""
        value={draft}
        placeholder="Tên mục…"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setDraft(e.target.value);
          committed.current = false;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          // Bộ gõ đang soạn dấu thì Enter là phím CHỐT DẤU của nó — cướp mất thì
          // "Nhận đợt" ra "Nhan đot", và lưu luôn cái tên hỏng ấy.
          if (isComposing(e)) return;

          switch (e.key) {
            case "Escape":
              cancelled.current = true;
              nav.stopEditing();
              break;
            case "Enter":
              commit();
              nav.move("down", true);
              break;
            case "Tab":
              commit();
              if (!nav.tab(e.shiftKey ? -1 : 1)) return;
              break;
            default:
              return;
          }
          e.preventDefault();
          e.stopPropagation();
        }}
        style={{
          flex: 1,
          minWidth: 0,
          background: "#fff",
          border: "1px solid var(--s-accent)",
          borderRadius: 3,
          padding: "2px 6px",
          fontSize: 12.5,
          fontWeight: 600,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span
      className="truncate"
      title={editable ? "Nháy đúp hoặc F2 để đổi tên mục" : undefined}
      onDoubleClick={(e) => {
        if (!editable) return;
        e.stopPropagation();
        nav.open(navId, COL_NAME);
      }}
      style={{
        fontWeight: 600,
        fontSize: 12.5,
        color: "#2f3a34",
        opacity: pending ? 0.4 : 1,
      }}
    >
      {stageLabel(row)}
    </span>
  );
}

/** Một phân loại còn thiếu mục, kèm chỗ để chép SL kế hoạch sang mục mới. */
type StageGroup = {
  categoryId: number;
  categoryName: string;
  missingMucs: MovementType[];
  /** Một mục sẵn có của cùng phân loại, để `addStage` chép kế hoạch từ đó. */
  sourceStageId?: number;
};

/**
 * Gom các dòng mục lại theo phân loại.
 *
 * Mọi dòng của cùng một phân loại đều mang chung `missingMucs`, nên lấy của dòng
 * nào cũng được; thứ phải nhặt thêm là một `stageId` thật để chép kế hoạch.
 *
 * Giữ cả phân loại đã đủ 4 mục hệ thống — mục TỰ DO thì lúc nào cũng thêm được,
 * nên cái nút "+" không bao giờ hết việc.
 */
function stageGroups(rows: GridRow[]): StageGroup[] {
  const by = new Map<number, StageGroup>();
  for (const r of rows) {
    const g = by.get(r.categoryId) ?? {
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      missingMucs: r.missingMucs,
    };
    if (r.stageId > 0) g.sourceStageId ??= r.stageId;
    by.set(r.categoryId, g);
  }
  return [...by.values()];
}

/**
 * Thêm một mục còn thiếu. Đặt ở cả dòng LSX (mọi phân loại) lẫn dòng mục (đúng
 * phân loại của nó) — gập LSX lại thì vẫn phải thêm mục được, mà dòng mục thì
 * lại là chỗ tay đang đứng sẵn.
 */
function AddStageButton({
  groups,
  title,
}: {
  groups: StageGroup[];
  title: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  /** Toạ độ theo viewport của menu; null = chưa đo được. */
  const [at, setAt] = useState<MenuPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Tên mục tự do đang gõ, theo từng phân loại. */
  const [names, setNames] = useState<Record<number, string>>({});

  /**
   * Một tiêu đề cho mỗi phân loại, một dòng cho mỗi mục thiếu, một ô nhập mục
   * tự do. Chỉ để ước lượng chiều cao mà lật menu lên khi dưới hết chỗ.
   */
  const lines = groups.reduce((a, g) => a + 2 + g.missingMucs.length, 0);

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
    // Ước lượng chiều cao rồi lật lên nếu bên dưới không đủ chỗ.
    const h = 10 + lines * 28;
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

  if (groups.length === 0) {
    // Giữ chỗ để các nút của mọi dòng luôn thẳng cột với nhau.
    return <span style={{ width: 26, flexShrink: 0 }} />;
  }

  const add = (g: StageGroup, type: MovementType) =>
    start(async () => {
      const res = await addStage(g.categoryId, type, g.sourceStageId);
      setOpen(false);
      if (res.ok) {
        toast.success(`Đã thêm mục "${MUC_LABEL[type]}" cho ${g.categoryName}`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi khi thêm mục.");
    });

  const addCustom = (g: StageGroup) => {
    const name = (names[g.categoryId] ?? "").trim();
    if (!name) return;
    start(async () => {
      const res = await addCustomStage(g.categoryId, name);
      setOpen(false);
      setNames((s) => ({ ...s, [g.categoryId]: "" }));
      if (res.ok) {
        toast.success(`Đã thêm mục "${name}" cho ${g.categoryName}`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi khi thêm mục.");
    });
  };

  return (
    <>
      <button
        ref={btnRef}
        title={title}
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
            {groups.map((g) => (
              <div key={g.categoryId}>
                <div
                  style={{
                    fontSize: 10.5,
                    textTransform: "uppercase",
                    letterSpacing: ".4px",
                    color: "var(--s-muted)",
                    padding: "4px 8px 2px",
                  }}
                >
                  Thêm mục · {g.categoryName}
                </div>
                {g.missingMucs.map((m) => (
                  <button
                    key={m}
                    onClick={() => add(g, m)}
                    disabled={pending}
                    style={{
                      display: "flex",
                      width: "100%",
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
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#eef5e9")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "none")
                    }
                  >
                    <Plus size={12} style={{ color: "var(--s-accent)" }} />
                    {MUC_LABEL[m]}
                  </button>
                ))}

                {/* Mục tự do: gõ tên rồi Enter. Không thuộc luồng sản xuất nào,
                    nên nó chỉ có đợt và số lượng. */}
                <input
                  value={names[g.categoryId] ?? ""}
                  disabled={pending}
                  placeholder="Mục mới… (Enter)"
                  onChange={(e) =>
                    setNames((s) => ({ ...s, [g.categoryId]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (isComposing(e)) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustom(g);
                    } else if (e.key === "Escape") setOpen(false);
                  }}
                  style={{
                    width: "100%",
                    margin: "2px 0 2px",
                    background: "#fff",
                    border: "1px dashed var(--s-card-line)",
                    borderRadius: 3,
                    padding: "5px 8px",
                    fontSize: 12.5,
                    outline: "none",
                  }}
                />
              </div>
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
  open,
  onToggle,
  selected,
  onCheck,
}: {
  row: GridRow;
  navId: string;
  part: GridChild;
  open: boolean;
  onToggle: () => void;
  selected: Record<string, boolean>;
  onCheck: (id: string, on: boolean) => void;
}) {
  const nav = useContext(NavCtx);
  return (
    <>
      <div
        data-nav={navId}
        tabIndex={nav.tabIndex(navId, COL_NAME)}
        onFocus={(e) =>
          e.target === e.currentTarget && nav.point(navId, COL_NAME)
        }
        onClick={() => {
          nav.point(navId, COL_NAME);
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

        <ReadCell
          rowId={navId}
          col={colTotal(nav.n)}
          style={{ fontWeight: 700, color: "var(--s-ink)" }}
        >
          {part.total || "–"}
        </ReadCell>

        <ReadCell rowId={navId} col={colDate(nav.n)} text>
          {""}
        </ReadCell>
        <ReadCell
          rowId={navId}
          col={colNote(nav.n)}
          text
          color="var(--s-muted)"
          style={{ fontSize: 11 }}
        >
          {part.note}
        </ReadCell>
        <span className="sheet-cell" style={{ borderRight: "none" }} />
      </div>

      {open && (
        <div className="sheet-expand">
          {(part.batches ?? []).map((b) => {
            const id = `${navId}/${b.key}`;
            return (
              <BatchRow
                key={b.key}
                navId={id}
                child={b}
                indent={INDENT.subBatch}
                bg={ROW_BG.subBatch}
                checked={!!selected[id]}
                onCheck={(on) => onCheck(id, on)}
              />
            );
          })}
          <AddBatchRow
            row={row}
            partId={part.partId}
            indent={INDENT.subBatch}
            bg={ROW_BG.subBatch}
            addId={`add:${navId}`}
            parentId={navId}
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
  checked,
  onCheck,
}: {
  child: GridChild;
  navId: string;
  indent: number;
  bg: string;
  checked: boolean;
  onCheck: (on: boolean) => void;
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
      tabIndex={nav.tabIndex(navId, COL_NAME)}
      onFocus={(e) => e.target === e.currentTarget && nav.point(navId, COL_NAME)}
      onClick={() => nav.point(navId, COL_NAME)}
      className="sheet-row sheet-hover sheet-expand"
      style={{
        ["--row-bg" as string]: checked ? "#dbeccf" : bg,
        outline: "none",
        opacity: pending ? 0.4 : 1,
      }}
    >
      <span
        className="sheet-cell sheet-freeze"
        style={{ gap: 7, paddingLeft: indent }}
      >
        {/* Checkbox đặt ở đúng độ thụt của dòng, như dòng mục — không gióng thành
            một cột dọc chung, vì cây thụt dần thì cột chung sẽ cắt ngang bậc thang. */}
        <span onClick={(e) => e.stopPropagation()} style={{ display: "flex" }}>
          <RowCheckbox
            checked={checked}
            onChange={onCheck}
            label={`Chọn đợt ${child.label}`}
          />
        </span>
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

      <ReadCell
        rowId={navId}
        col={colTotal(nav.n)}
        style={{ fontWeight: 700, color: "var(--s-ink)" }}
      >
        {child.total || "–"}
      </ReadCell>

      <EditDateCell
        rowId={navId}
        col={colDate(nav.n)}
        iso={child.dateIso!}
        label={child.dateLabel}
        save={(iso) => setMovementDate(child.movementId!, iso)}
      />

      <EditTextCell
        rowId={navId}
        col={colNote(nav.n)}
        value={child.note ?? ""}
        placeholder="Ghi chú…"
        save={(text) => setMovementNote(child.movementId!, text)}
      />

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
 * Ô CHỈ ĐỌC nhưng vẫn đậu được con trỏ — tầng LSX và tầng mục.
 *
 * Phải có `tabIndex` thật, không thì `focus()` của bảng trượt khỏi nó và con trỏ
 * âm thầm kẹt lại ở ô cũ: mũi tên phải đi qua được mọi ô, y như một sheet Excel
 * có ô khoá — đậu được, chỉ là gõ vào thì không.
 */
function ReadCell({
  rowId,
  col,
  color,
  title,
  text,
  style,
  children,
}: {
  rowId: string;
  col: number;
  color?: string;
  title?: string;
  /** Ô chữ: canh trái và cắt cụt, thay vì canh phải như ô số. */
  text?: boolean;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const nav = useContext(NavCtx);
  const focused = nav.at(rowId, col);

  return (
    <span
      role="button"
      tabIndex={nav.tabIndex(rowId, col)}
      className={
        text ? "sheet-cell truncate" : "sheet-cell sheet-cell--num"
      }
      data-col={col}
      data-focused={focused || undefined}
      title={title}
      // Dòng cha có onClick gập/mở; ô không được kéo theo cả dòng.
      onClick={(e) => {
        e.stopPropagation();
        nav.point(rowId, col);
      }}
      style={{
        color,
        cursor: "default",
        outline: "none",
        ...(text ? { whiteSpace: "nowrap" } : null),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * Ô của dòng mục: TỔNG CÁC ĐỢT bên dưới, đối chiếu với SL gốc của LSX.
 * Chỉ đọc — muốn đổi số thì sửa ở đúng cái đợt đã tạo ra nó.
 *
 * Xanh = đã đủ gốc, đỏ = còn thiếu, xám = chưa có đợt nào chạm tới size này.
 */
function StageCell({
  cell,
  col,
  rowId,
}: {
  cell: Cell;
  col: number;
  rowId: string;
}) {
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
    <ReadCell rowId={rowId} col={col} color={color} title={title}>
      {cell.value || "–"}
    </ReadCell>
  );
}

/**
 * Ô ngày sửa tại chỗ — ngày tạo LSX, và ngày của đợt.
 *
 * Trạng thái "đang sửa" do BẢNG giữ, như ô số: có thế mũi tên mới đi vào ô này
 * được, và Enter mới bê được chế độ sửa sang dòng dưới.
 */
function EditDateCell({
  rowId,
  col,
  iso,
  label,
  save,
}: {
  rowId: string;
  col: number;
  iso: string;
  label: string;
  save: (iso: string) => Promise<CellResult>;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [pending, start] = useTransition();
  const cancelled = useRef(false);
  const committed = useRef(false);

  const focused = nav.at(rowId, col);
  const editing = focused && nav.editing;

  const commit = (next: string) => {
    if (committed.current || cancelled.current) return;
    committed.current = true;
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
        data-col={col}
        defaultValue={iso}
        className="sheet-cell--input"
        style={{ textAlign: "left", fontSize: 11.5 }}
        onClick={(e) => e.stopPropagation()}
        onFocus={() => {
          cancelled.current = false;
          committed.current = false;
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          switch (e.key) {
            case "Escape":
              cancelled.current = true;
              nav.stopEditing();
              break;
            case "Enter":
              commit(el.value);
              nav.move("down", true);
              break;
            case "Tab":
              commit(el.value);
              if (!nav.tab(e.shiftKey ? -1 : 1)) return;
              break;
            // ←/→/↑/↓ là phím của chính ô ngày (đi giữa ngày·tháng·năm, tăng
            // giảm số). Muốn ra khỏi nó thì dùng Tab hoặc Enter — giành mất thì
            // không sửa được tháng bằng bàn phím nữa.
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
      data-col={col}
      data-focused={focused || undefined}
      title="Bấm để sửa ngày"
      className="sheet-cell"
      onClick={(e) => {
        e.stopPropagation();
        nav.open(rowId, col);
      }}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key !== "Enter") return;
        nav.open(rowId, col);
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        fontSize: 11.5,
        cursor: "pointer",
        whiteSpace: "nowrap",
        outline: "none",
        color: "var(--s-ink-2)",
        opacity: pending ? 0.4 : 1,
      }}
    >
      {label}
    </span>
  );
}

/**
 * Ô CHỮ sửa tại chỗ — ghi chú, và tên mục.
 *
 * Khác ô số ở ba chỗ: không tính biểu thức, không nuốt Delete (Delete trong một
 * ô chữ là xoá ký tự), và phải nhường phím cho bộ gõ tiếng Việt khi nó đang soạn
 * dấu — cướp Enter lúc ấy thì "đợt" ra "đot".
 */
function EditTextCell({
  rowId,
  col,
  value,
  placeholder,
  title,
  save,
  style,
}: {
  rowId: string;
  col: number;
  value: string;
  placeholder?: string;
  title?: string;
  save: (text: string) => Promise<CellResult>;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [draft, setDraft] = useState("");
  const [wasEditing, setWasEditing] = useState(false);
  const [pending, start] = useTransition();
  const cancelled = useRef(false);
  const committed = useRef(false);

  const focused = nav.at(rowId, col);
  const editing = focused && nav.editing;

  // Nạp nháp ngay trong lúc render, không trong effect — xem ghi chú dài ở `EditCell`.
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) {
      cancelled.current = false;
      committed.current = false;
      setDraft(value);
    }
  }

  const commit = () => {
    if (committed.current || cancelled.current) return;
    committed.current = true;
    if (draft.trim() === value.trim()) return;
    start(async () => {
      const res = await save(draft);
      if (res.ok) router.refresh();
      else {
        toast.error(res.error ?? "Lỗi khi lưu.");
        router.refresh();
      }
    });
  };

  if (editing) {
    return (
      <input
        data-col={col}
        value={draft}
        placeholder={placeholder}
        className="sheet-cell--input"
        style={{ textAlign: "left", fontSize: 11.5, ...style }}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setDraft(e.target.value);
          committed.current = false;
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (isComposing(e)) return;

          const el = e.currentTarget;
          const collapsed = el.selectionStart === el.selectionEnd;

          switch (e.key) {
            case "Escape":
              cancelled.current = true;
              nav.stopEditing();
              break;
            case "Enter":
              commit();
              nav.move("down", true);
              break;
            case "ArrowUp":
            case "ArrowDown":
              commit();
              nav.move(e.key === "ArrowUp" ? "up" : "down", true);
              break;
            case "Tab":
              commit();
              if (!nav.tab(e.shiftKey ? -1 : 1)) return;
              break;
            // Chỉ rời ô khi con trỏ chữ đã ở mép — không thì sửa một chữ giữa
            // câu cũng bị hất sang ô bên cạnh.
            case "ArrowLeft":
              if (!collapsed || el.selectionStart !== 0) return;
              commit();
              nav.move("left", true);
              break;
            case "ArrowRight":
              if (!collapsed || el.selectionStart !== el.value.length) return;
              commit();
              nav.move("right", true);
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
      data-col={col}
      data-focused={focused || undefined}
      title={title ?? "Bấm để sửa"}
      className="sheet-cell truncate"
      onClick={(e) => {
        e.stopPropagation();
        nav.open(rowId, col);
      }}
      onKeyDown={(e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Cố ý KHÔNG mở bằng cách gõ thẳng một chữ cái như ô số.
        //
        // Chữ cái là lệnh của bảng ở mọi ô: `a` thêm đợt, `x` tick dòng. Ô số
        // giành được phím vì biểu thức chỉ gồm chữ số và dấu phép tính, không
        // đụng chữ cái nào; ô chữ mà cũng giành thì đứng ở cột Ghi chú là mất
        // sạch phím tắt. Enter/F2 mở sửa — F2 là phím sửa ô của Excel.
        if (e.key === "Enter" || e.key === "F2") nav.open(rowId, col);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        fontSize: 11,
        cursor: "pointer",
        outline: "none",
        whiteSpace: "nowrap",
        color: value ? "var(--s-ink-2)" : "var(--s-faint)",
        opacity: pending ? 0.4 : 1,
        ...style,
      }}
    >
      {value || placeholder || "—"}
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
  /** Ký tự vừa gõ để mở ô; đè lên giá trị cũ thay vì nối vào. */
  const seed = useRef<string | null>(null);
  /** Lượt sửa này mở ra bằng một ký tự gõ vào — bảng cần biết để đừng bôi đen nó. */
  const seeded = useRef(false);

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
      seeded.current = seed.current != null;
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

  /**
   * Chốt ô: tính biểu thức trong nháp rồi lưu kết quả.
   *
   * Trả về false khi biểu thức sai — caller phải ĐỨNG YÊN, không dời con trỏ và
   * không ghi đè số cũ. Người gõ nhầm một dấu ngoặc thì được ở lại đúng ô đó mà
   * sửa, chứ không bị hất đi kèm theo một con số bậy.
   */
  const commit = (): boolean => {
    if (committed.current || cancelled.current) return true;

    const res = calcQty(draft);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }

    committed.current = true;
    write(res.value);
    return true;
  };

  if (editing) {
    return (
      <input
        data-col={col}
        data-seed={seeded.current ? "1" : undefined}
        // Không còn `inputMode="numeric"`: bàn phím số của máy tính bảng không có
        // dấu ngoặc lẫn dấu nhân.
        value={draft}
        className="sheet-cell--input"
        // Dòng cha có onClick mở/gập; không chặn thì bấm vào ô là gập dòng lại.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          setDraft(e.target.value.replace(CALC_STRIP, ""));
          // Gõ thêm sau khi đã chốt (ví dụ bấm → ở ô ngoài cùng phải, không đi
          // đâu được) là một lượt sửa mới — mở lại cửa cho `commit`.
          committed.current = false;
        }}
        onBlur={() => {
          commit();
        }}
        onKeyDown={(e) => {
          // Bộ gõ đang soạn dấu thì phím là của nó. Ô số hiếm khi gõ tiếng Việt,
          // nhưng chặn ở đây cho cùng một luật với các ô chữ.
          if (isComposing(e)) return;

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
              if (!commit()) break;
              nav.move("down", true);
              break;
            case "ArrowUp":
            case "ArrowDown":
              if (!commit()) break;
              nav.move(e.key === "ArrowUp" ? "up" : "down", true);
              break;

            // Hết bảng thì nhả Tab cho trình duyệt, đừng nhốt con trỏ trong ô.
            case "Tab":
              if (!commit()) break;
              if (!nav.tab(e.shiftKey ? -1 : 1)) return;
              break;

            // Chỉ nhảy khi con trỏ chữ đã ở đầu/cuối ô; cướp phím vô điều kiện
            // thì không sửa được chữ số ở giữa biểu thức.
            case "ArrowLeft":
              if (!collapsed || el.selectionStart !== 0) return;
              if (!commit()) break;
              nav.move("left", true);
              break;
            case "ArrowRight":
              if (!collapsed || el.selectionStart !== el.value.length) return;
              if (!commit()) break;
              nav.move("right", true);
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
      title="Bấm để sửa · gõ được cả biểu thức, ví dụ 100+200"
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
        // Ô này GÕ ĐƯỢC, nên Delete ở đây nghĩa là xoá số. TRỪ khi đang có dòng
        // được tick: tick rồi bấm Delete là muốn xoá dòng, và ý định ấy đã nói ra
        // rành mạch bằng cái checkbox — nhường phím lên cho bảng.
        else if (e.key === "Delete" || e.key === "Backspace") {
          if (nav.hasSelection) return;
          write(0);
        }
        // Mở ô bằng chính ký tự vừa gõ, kể cả "(" hay "-": biểu thức bắt đầu
        // được ngay mà không phải bấm Enter trước.
        else if (e.key.length === 1 && CALC_CHARS.test(e.key)) {
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

/**
 * Bàn phím của một dòng "thêm mới" (đợt mới, chi tiết mới).
 *
 * Dòng này KHÔNG nằm trong `nav` — nó là bản nháp, chưa phải một dòng của bảng —
 * nên con trỏ chung của bảng không với tới được. Nó phải tự lo lấy phím của
 * mình, và mọi thứ chỉ quẩn quanh trong chính nó: nháp không bao giờ bị bỏ lại
 * vì con trỏ đi lạc.
 */
function addRowKeys(submit: () => void, close: () => void) {
  return (e: React.KeyboardEvent) => {
    // Bộ gõ tiếng Việt đang soạn dấu: Enter là phím CHỐT DẤU của nó, không phải
    // phím lưu của ta. Cướp mất thì gõ "đợt" ra "đot" — và lưu luôn dòng dở dang.
    if (isComposing(e)) return;

    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Escape") {
      close();
      return;
    }

    const el = e.target as HTMLElement;
    if (!(el instanceof HTMLInputElement)) return;
    // Ô ngày tự dùng ←/→ để đi giữa ngày·tháng·năm và ↑/↓ để tăng giảm. Đừng
    // giành; muốn ra khỏi nó thì dùng Tab.
    if (el.type === "date") return;

    // ↑/↓ đi thẳng sang ô kề. ←/→ chỉ đi khi con trỏ chữ đã ở mép — không thì
    // sửa một chữ số ở giữa số cũng bị hất sang ô khác.
    let dir: 1 | -1;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowLeft":
        dir = -1;
        break;
      case "ArrowDown":
      case "ArrowRight":
        dir = 1;
        break;
      default:
        return;
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const caret = el.selectionStart;
      if (caret === null || caret !== el.selectionEnd) return;
      if (dir < 0 ? caret !== 0 : caret !== el.value.length) return;
    }

    const row = el.closest(".sheet-row");
    if (!row) return;
    const inputs = [
      ...row.querySelectorAll<HTMLInputElement>("input:not([disabled])"),
    ];
    const next = inputs[inputs.indexOf(el) + dir];
    if (!next) return;

    e.preventDefault();
    next.focus();
    next.select();
  };
}

/**
 * Ô nhập số trong các dòng "thêm mới". Gõ được biểu thức y như ô của bảng
 * ("100+200"), và tính ra kết quả lúc lưu — chứ không phải chỉ ô của bảng mới
 * tính được còn ô nhập mới thì không.
 */
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

  // Biểu thức đang gõ dở ("100+") chưa tính được, nhưng đó KHÔNG phải lỗi — chỉ
  // là chưa xong. Tô đỏ lúc ấy thì cả lúc gõ giữa chừng ô cũng đỏ. Để lúc lưu
  // mới phán xét; ở đây chỉ nhắc bằng màu khi ô đã có gì đó mà vẫn không tính ra.
  const bad = value.trim() !== "" && !calcQty(value).ok;

  return (
    <input
      autoFocus={autoFocus}
      data-col={col}
      // Không có `inputMode="numeric"`: bàn phím số của máy bảng thiếu dấu ngoặc
      // lẫn dấu nhân.
      value={value}
      onChange={(e) => onChange(e.target.value.replace(CALC_STRIP, ""))}
      title="Gõ được biểu thức, ví dụ 100+200"
      className="sheet-cell--input"
      style={{
        boxShadow: `inset 0 0 0 1px ${bad ? "var(--s-short)" : "var(--s-card-line)"}`,
      }}
    />
  );
}

/**
 * Tính hết các ô nháp của một dòng "thêm mới".
 *
 * Sai một ô là hỏng cả dòng: thà không lưu gì còn hơn lưu một nửa số đúng rồi
 * để người ta tự đoán nửa còn lại rơi ở đâu. Lỗi nói rõ CỘT NÀO — dòng có cả
 * chục ô, "biểu thức không hợp lệ" trơ trọi thì biết đi tìm ở đâu.
 */
function calcDrafts(
  qty: string[],
  columns: SizeColumn[]
): { ok: true; values: number[] } | { ok: false; error: string } {
  const values: number[] = [];
  for (let i = 0; i < qty.length; i++) {
    const r = calcQty(qty[i] ?? "");
    if (!r.ok)
      return { ok: false, error: `Size ${columns[i]?.label ?? i + 1}: ${r.error}` };
    values.push(r.value);
  }
  return { ok: true, values };
}

/** Tổng tạm hiện ở cột "Tổng" khi đang gõ; ô nào chưa tính ra thì coi như 0. */
function draftTotal(qty: string[]): number {
  return qty.reduce((a, v) => {
    const r = calcQty(v ?? "");
    return a + (r.ok ? r.value : 0);
  }, 0);
}

/** Dòng "＋ Thêm ..." — bấm vào để mở ô nhập, hoặc để đẻ thẳng một dòng mới. */
function AddTrigger({
  label,
  indent,
  bg,
  cols,
  busy,
  onOpen,
}: {
  label: string;
  indent: number;
  bg: string;
  cols: number;
  busy?: boolean;
  onOpen: () => void;
}) {
  return (
    <div
      className="sheet-row sheet-hover"
      onClick={busy ? undefined : onOpen}
      style={{
        ["--row-bg" as string]: bg,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.5 : 1,
      }}
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

    const calc = calcDrafts(qty, columns);
    if (!calc.ok) {
      toast.error(calc.error);
      return;
    }

    const targets = row.cells
      .map((c, i) => ({ orderSizeId: c.orderSizeId, qty: calc.values[i] }))
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

  const total = draftTotal(qty);
  const keys = addRowKeys(submit, close);

  return (
    <div
      className="sheet-row sheet-expand"
      style={{
        ["--row-bg" as string]: ROW_BG.part,
        opacity: pending ? 0.5 : 1,
      }}
      onKeyDown={keys}
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

/**
 * "＋ Thêm đợt" — đẻ NGAY một dòng trống rồi thả con trỏ vào ô đầu tiên của nó.
 *
 * Không còn form nháp. Dòng nháp là một cái bảng thứ hai nằm trong bảng: nó có
 * ô riêng, phím riêng, và người dùng phải điền cho xong rồi bấm lưu mới thấy dòng
 * thật hiện ra. Đợt trống thì ngược lại — nó LÀ dòng thật ngay từ đầu, gõ vào ô
 * nào lưu ô ấy, y như chèn một dòng trên Excel.
 */
function AddBatchRow({
  row,
  partId,
  indent,
  bg,
  addId,
  parentId,
}: {
  row: GridRow;
  partId: number | null;
  indent: number;
  bg: string;
  /** Khoá mà phím `a` dùng để gọi đúng dòng này. */
  addId: string;
  /** id điều hướng của dòng cha — để dựng id của dòng vừa tạo. */
  parentId: string;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [pending, start] = useTransition();
  /** `a` là một xung, không phải một trạng thái — chỉ được đẻ đúng một dòng. */
  const fired = useRef(false);

  const isReceive = row.muc === "SEW_IN" || row.muc === "EMB_IN";
  const label = !row.muc
    ? "Thêm đợt…"
    : isReceive
      ? "Thêm đợt nhận…"
      : "Thêm đợt gửi…";

  const add = () =>
    start(async () => {
      const res = await addBatch({
        orderId: row.orderId,
        stageId: row.stageId,
        type: row.muc,
        date: today(),
        partId,
        quantities: [],
      });
      if (!res.ok || res.movementId == null) {
        toast.error(res.error ?? "Lỗi khi thêm đợt.");
        return;
      }

      // Dòng mới chưa có trong `nav` — dữ liệu còn đang trên đường về. Đặt hẹn,
      // con trỏ sẽ nhảy vào đúng ô số đầu tiên ngay khi dòng hiện ra.
      const col = row.cells.findIndex((c) => c.orderSizeId != null);
      nav.focusOnArrive({
        id: `${parentId}/mv-${res.movementId}-${partId ?? "all"}`,
        col: col >= 0 ? col : COL_NAME,
      });
      router.refresh();
    });

  // Phím `a` của bảng cũng gọi tới đây. Bảng không biết dòng này là dòng nào,
  // nên nó chỉ gọi tên qua `addOpen`; dòng tự nhận ra mình rồi tự đẻ.
  useEffect(() => {
    if (nav.addOpen !== addId) {
      fired.current = false;
      return;
    }
    if (fired.current) return;
    fired.current = true;
    nav.setAddOpen(null);
    add();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.addOpen, addId]);

  return (
    <AddTrigger
      label={label}
      indent={indent}
      bg={bg}
      cols={nav.n + 6}
      busy={pending}
      onOpen={add}
    />
  );
}
