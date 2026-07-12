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
  setStageTarget,
  type CellResult,
} from "@/app/actions/grid";
import OrderFormModal from "@/components/forms/OrderFormModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { GlassProvider } from "@/components/ui/glass-context";
import { useHotkeys } from "@/lib/hotkeys";
import {
  ROW_LEVEL,
  buildNav,
  collapseOrOut,
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
 * Con trỏ bàn phím. Ô tự hỏi "tôi có đang được trỏ không" thay vì bảng phải
 * biết từng ô; và mọi lệnh di chuyển đều đi qua đây nên `EditCell` không cần
 * biết gì về hình dạng của bảng.
 */
type NavApi = {
  /** Con trỏ đang đúng ở ô này. */
  at: (id: string, col: number) => boolean;
  /** Ô đang được trỏ có đang mở chế độ sửa không. */
  editing: boolean;
  tabIndex: (id: string, col: number) => 0 | -1;
  /** Dời con trỏ, không mở sửa. */
  point: (id: string, col: number) => void;
  /** Dời con trỏ và mở sửa (chuột bấm vào ô, hoặc gõ thẳng một chữ số). */
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

/** Dải sáng chạy suốt chiều cao, đặt trong mọi vùng có dòng (header + thân). */
function ColumnBands() {
  return (
    <>
      <div className="glass-colband glass-colband--hover" />
      <div className="glass-colband glass-colband--edit" />
    </>
  );
}

/**
 * Toạ độ của một ô trong hệ quy chiếu nội dung bảng.
 * Đo theo `.glass-row` cha chứ không theo viewport: hàng luôn bắt đầu đúng ở
 * mép trái vùng nội dung, nên số đo không đổi khi cuộn ngang.
 */
function measureCell(cell: Element): { x: number; w: number } | null {
  const row = cell.closest(".glass-row");
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

type Tone = "lit" | "dim" | "short";

/**
 * Ô đủ định mức → chữ trắng; thiếu → cam đỏ; không có số / phân loại không khai
 * báo size này → mờ.
 */
function toneOf(c: Cell): Tone {
  if (c.orderSizeId == null) return "dim";
  if (c.target > 0 && c.done < c.target) return "short";
  if (c.value === 0) return "dim";
  return "lit";
}

const TONE_COLOR: Record<Tone, string> = {
  lit: "rgba(255,255,255,0.85)",
  dim: "var(--g-dim)",
  short: "var(--g-short)",
};

/** Nhãn cột trải dài từ LSX tới Phân loại. */
const LABEL_SPAN = 4;

export default function LsxGrid({
  rows,
  columns,
}: {
  rows: GridRow[];
  columns: SizeColumn[];
}) {
  const n = columns.length;
  // Cột size co giãn (không cố định 46px): nếu chỉ LSX và Ghi chú hút chỗ dư thì
  // khi khối kính rộng, cụm size bị đẩy sang phải và giữa bảng hở một mảng lớn.
  const gridCols = `32px 28px minmax(160px,1.2fr) 110px 104px 92px repeat(${n},minmax(46px,0.4fr)) 60px 96px minmax(120px,1fr) 116px`;
  // 6 cột đầu + 4 cột cuối = 918px, cộng bề rộng TỐI THIỂU của cột size và gap.
  // Cột cuối 116px = 3 nút 32px + 2 khoảng 6px + đệm.
  const minWidth = 918 + n * 46 + (n + 9) * 8;

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
  /** `add:<id dòng chứa>`; chỉ một dòng nhập mới mở tại một thời điểm. */
  const [addOpen, setAddOpen] = useState<string | null>(null);
  /** Neo của dải Shift+↑/↓; đặt lại mỗi khi tick bằng Space. */
  const anchor = useRef<string | null>(null);

  /** Đúng những dòng đang nhìn thấy, đã trải phẳng. */
  const nav = useMemo(
    () => buildNav(rows, openRows, openParts),
    [rows, openRows, openParts]
  );

  // Đổi trang / đổi bộ lọc thì bỏ chọn — key cũ không còn ứng với dòng nào.
  useEffect(() => {
    setSelected({});
    anchor.current = null;
  }, [rows]);

  // Gập một dòng có thể nuốt mất dòng đang trỏ. Kéo con trỏ về tổ tiên gần nhất
  // còn hiện, chứ đừng để nó trỏ vào hư không.
  useEffect(() => {
    if (!cursor) return;
    const next = reanchor(nav, cursor);
    if (next === cursor) return;
    setCursor(next);
    setEditing(false);
  }, [nav, cursor]);

  const selectedRows = rows.filter((r) => selected[r.key]);

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
      // phân loại. Không gom về LSX nữa.
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
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  /** Bề rộng thanh cuộn dọc của vùng thân — header phải chừa đúng bấy nhiêu. */
  const [gutter, setGutter] = useState(0);

  // Header nằm ngoài vùng cuộn nên không có thanh cuộn dọc; nếu không chừa chỗ
  // thì các cột lệch nhau đúng bằng bề rộng thanh cuộn.
  useEffect(() => {
    const body = bodyRef.current;
    const inner = innerRef.current;
    if (!body || !inner) return;

    const measure = () => setGutter(body.offsetWidth - body.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    ro.observe(inner); // đóng/mở dòng làm thanh cuộn xuất hiện rồi biến mất
    return () => ro.disconnect();
  }, []);

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

  const toggleRow = (k: string) => setOpenRows((s) => ({ ...s, [k]: !s[k] }));
  const togglePart = (k: string) => setOpenParts((s) => ({ ...s, [k]: !s[k] }));

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
    // Tìm trong thân bảng thôi: header cũng mang `data-col`.
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
    // `addOpen` có trong deps để lúc đóng dòng nhập, nét quay về ô đang trỏ.
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

  /** id có dấu "/" là dòng chi tiết; còn lại là dòng cha. */
  const setOpen = (id: string, on: boolean) =>
    id.includes("/")
      ? setOpenParts((s) => ({ ...s, [id]: on }))
      : setOpenRows((s) => ({ ...s, [id]: on }));

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
        setSelected(Object.fromEntries(rows.map((r) => [r.key, true])));
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
          setOpenRows({});
          setOpenParts({});
          break;
        case "ArrowRight":
          setOpenRows(
            Object.fromEntries(
              rows.filter((r) => r.stageId > 0).map((r) => [r.key, true])
            )
          );
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
      // lên dòng cha rồi mới bấm được.
      case "a":
      case "A": {
        if (!here) return;
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
        // Dòng con không có checkbox. Vẫn nuốt Space để trang không nhảy.
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

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <span
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            background: "var(--g-fill)",
            border: "1px solid var(--g-line-3)",
            color: "var(--g-text-4)",
          }}
        >
          <SearchX size={28} />
        </span>
        <p style={{ color: "var(--g-text-3)" }}>
          Không có lệnh sản xuất nào khớp bộ lọc.
        </p>
      </div>
    );
  }

  return (
    <NavCtx.Provider value={api}>
    <div
      ref={scopeRef}
      className="relative flex h-full flex-col"
      style={{ ["--grid-cols" as string]: gridCols }}
      onMouseOver={trackHover}
      onMouseLeave={() => setAttr("data-hovercol", null)}
    >
      {/* Header ở NGOÀI vùng cuộn dọc: nhờ vậy nó luôn hiện mà vẫn trong suốt,
          không cần nền để che dòng trôi qua bên dưới. Cuộn ngang đồng bộ tay. */}
      <div
        ref={headRef}
        className="shrink-0 overflow-hidden"
        style={{ paddingRight: gutter }}
      >
        <div style={{ minWidth, position: "relative" }}>
          <ColumnBands />
          <Header
            columns={columns}
            allChecked={rows.length > 0 && selectedRows.length === rows.length}
            someChecked={selectedRows.length > 0}
            onToggleAll={(on) =>
              setSelected(
                on ? Object.fromEntries(rows.map((r) => [r.key, true])) : {}
              )
            }
          />
        </div>
      </div>

      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(e) => {
          if (headRef.current)
            headRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div ref={innerRef} style={{ minWidth, position: "relative" }}>
          <ColumnBands />
          {rows.map((row) => {
            const open = !!openRows[row.key] && row.stageId > 0;
            return (
              <div key={row.key}>
                <ParentRow
                  row={row}
                  navId={row.key}
                  open={open}
                  checked={!!selected[row.key]}
                  onToggle={() => row.stageId > 0 && toggleRow(row.key)}
                  onCheck={(on) =>
                    setSelected((s) => ({ ...s, [row.key]: on }))
                  }
                  onEdit={() => setEditOrder(row.orderId)}
                  onDelete={() => setPendingDelete([row])}
                />

                {open && (
                  <div
                    className="glass-expand"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      // Viền vẽ bằng inset shadow, và không có padding ngang:
                      // border + padding sẽ thu hẹp lưới của dòng con so với
                      // dòng cha, mà cột size là `fr` nên phần hẹp đi bị chia
                      // lại — các ô số lệch dần khỏi cột của dòng cha.
                      boxShadow: "inset 0 0 0 1px var(--g-line-2)",
                      borderRadius: 14,
                      margin: "4px 0 12px",
                      padding: "6px 0 10px",
                    }}
                  >
                    <div
                      className="glass-row"
                      style={{
                        padding: "9px 0 6px",
                        fontSize: 11,
                        color: "rgba(198,181,255,0.9)",
                        letterSpacing: ".4px",
                        textTransform: "uppercase",
                      }}
                    >
                      <span />
                      <span />
                      <span
                        style={{ gridColumn: `span ${n + 8}`, paddingLeft: 28 }}
                      >
                        {row.childHeader}
                      </span>
                    </div>

                    {row.muc === "SEW_OUT"
                      ? row.children.map((part, i) => (
                          <PartBlock
                            key={part.key}
                            row={row}
                            navId={`${row.key}/${part.key}`}
                            part={part}
                            columns={columns}
                            index={i}
                            open={!!openParts[`${row.key}/${part.key}`]}
                            onToggle={() => togglePart(`${row.key}/${part.key}`)}
                          />
                        ))
                      : row.children.map((child, i) => (
                          <ChildRow
                            key={child.key}
                            navId={`${row.key}/${child.key}`}
                            child={child}
                            indent={28}
                            index={i}
                          />
                        ))}

                    {row.muc === "SEW_OUT" ? (
                      <AddPartRow
                        row={row}
                        columns={columns}
                        addId={`add:${row.key}`}
                      />
                    ) : (
                      <AddBatchRow
                        row={row}
                        columns={columns}
                        partId={null}
                        indent={28}
                        addId={`add:${row.key}`}
                      />
                    )}
                  </div>
                )}
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
        glass
      />

      <GlassProvider value>
        <ConfirmDialog
          open={pendingDelete !== null}
          onOpenChange={(v) => !v && setPendingDelete(null)}
          danger
          title={deleteTitle(pendingDelete)}
          description={describeDelete(pendingDelete)}
          confirmLabel="Xoá"
          onConfirm={() => pendingDelete && runDelete(pendingDelete)}
        />
      </GlassProvider>
    </div>
    </NavCtx.Provider>
  );
}

/** Nhãn của một dòng: "LSX · Phân loại · Mục", hoặc phân loại nếu chưa có mục. */
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
  return (
    <div
      className="glass-card"
      style={{
        position: "absolute",
        bottom: 14,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 5,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 12px 9px 16px",
        borderRadius: 14,
        fontSize: 13,
      }}
    >
      <span>
        Đã chọn <b>{rowCount}</b> dòng
      </span>
      <button
        onClick={onClear}
        style={{
          background: "var(--g-fill)",
          border: "1px solid var(--g-line-3)",
          borderRadius: 9,
          padding: "5px 10px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Bỏ chọn
      </button>
      <button
        onClick={onExport}
        disabled={exporting || exportable === 0}
        title="Xuất các dòng đã chọn ra Excel"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "var(--g-fill)",
          border: "1px solid var(--g-line-3)",
          borderRadius: 9,
          padding: "5px 10px",
          fontSize: 12,
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
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "rgba(255,157,122,0.16)",
          border: "1px solid rgba(255,157,122,0.4)",
          color: "var(--g-short)",
          borderRadius: 9,
          padding: "5px 10px",
          fontSize: 12,
          fontWeight: 500,
          cursor: busy ? "default" : "pointer",
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Trash2 size={13} /> {busy ? "Đang xoá…" : "Xoá dòng đã chọn"}
      </button>
    </div>
  );
}

/** Dòng con hiện lần lượt khi mở rộng — trễ dần, chặn trên để không lê thê. */
function stagger(index: number): React.CSSProperties {
  return { animationDelay: `${Math.min(index * 28, 160)}ms` };
}

/** Không cần nền: nó nằm ngoài vùng cuộn nên chẳng có gì trôi qua sau nó. */
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
  return (
    <div
      className="glass-row"
      style={{
        padding: "12px 0",
        fontSize: 15,
        fontWeight: 500,
        color: "#fff",
        borderBottom: "1px solid var(--g-line-4)",
        alignItems: "end",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ display: "flex", justifyContent: "center" }}>
        <RowCheckbox
          checked={allChecked}
          indeterminate={someChecked && !allChecked}
          onChange={onToggleAll}
          label="Chọn tất cả dòng"
        />
      </span>
      <span />
      <SortHead sortKey="code">LSX</SortHead>
      <SortHead sortKey="line">Chuyền may</SortHead>
      <span>Mục</span>
      <span>Phân loại</span>
      {columns.map((c, i) => (
        <span
          key={c.id}
          className="glass-cell"
          data-col={i}
          style={{ textAlign: "center", fontSize: 11, lineHeight: 1.1 }}
        >
          {c.label}
        </span>
      ))}
      <span style={{ textAlign: "center" }}>Tổng</span>
      <SortHead sortKey="createdAt">Ngày tạo</SortHead>
      <span>Ghi chú</span>
      <span />
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
        fontSize: 15,
        fontWeight: 500,
        color: active ? "var(--g-accent)" : "#fff",
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
        <ChevronsUpDown size={12} style={{ opacity: 0.4 }} />
      )}
    </button>
  );
}

function ParentRow({
  row,
  navId,
  open,
  checked,
  onToggle,
  onCheck,
  onEdit,
  onDelete,
}: {
  row: GridRow;
  navId: string;
  open: boolean;
  checked: boolean;
  onToggle: () => void;
  onCheck: (on: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const nav = useContext(NavCtx);
  return (
    <div
      data-nav={navId}
      tabIndex={nav.tabIndex(navId, ROW_LEVEL)}
      // Tab từ thanh công cụ rơi vào đây; con trỏ phải theo, không thì phím
      // mũi tên tiếp theo chẳng biết bắt đầu từ đâu.
      onFocus={(e) => e.target === e.currentTarget && nav.point(navId, ROW_LEVEL)}
      onClick={() => {
        nav.point(navId, ROW_LEVEL);
        onToggle();
      }}
      className="glass-row glass-hover"
      style={{
        padding: "13px 0",
        fontSize: 14,
        color: "rgba(255,255,255,0.85)",
        borderBottom: "1px solid var(--g-line-1)",
        alignItems: "center",
        cursor: "pointer",
        outline: "none",
        background: checked ? "rgba(198,181,255,0.10)" : undefined,
      }}
    >
      <span
        style={{ display: "flex", justifyContent: "center" }}
        onClick={(e) => e.stopPropagation()}
      >
        <RowCheckbox
          checked={checked}
          onChange={onCheck}
          label={`Chọn ${row.code} · ${row.categoryName} · ${row.mucLabel}`}
        />
      </span>

      <span
        style={{
          display: "flex",
          justifyContent: "center",
          color: "var(--g-text-3)",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform .15s",
          visibility: row.stageId > 0 ? "visible" : "hidden",
        }}
      >
        <ChevronRight size={13} />
      </span>

      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#fff" }}>
          {row.code}
        </span>
        <span
          className="truncate"
          style={{ fontSize: 12, color: "var(--g-text-4)" }}
        >
          {row.productName}
        </span>
      </span>

      <span className="truncate" style={{ color: "var(--g-text-2)" }}>
        {row.lineName ?? <span style={{ color: "var(--g-dim)" }}>chưa gán</span>}
      </span>
      <span>{row.mucLabel}</span>
      <span className="truncate" style={{ color: "var(--g-text-2)" }}>
        {row.categoryName}
      </span>

      {row.cells.map((c, i) =>
        row.editableTarget ? (
          <EditCell
            key={i}
            rowId={navId}
            cell={c}
            col={i}
            save={(q) => setStageTarget(row.stageId, c.orderSizeId!, q)}
          />
        ) : (
          <StaticCell key={i} cell={c} col={i} />
        )
      )}

      <span style={{ textAlign: "center", fontWeight: 700, color: "#fff" }}>
        {row.total || "—"}
      </span>
      <EditDateCell
        iso={row.createdAtIso}
        label={row.createdAt}
        save={(iso) => setOrderCreatedAt(row.orderId, iso)}
      />
      <span
        className="truncate"
        style={{ fontSize: 12, color: "var(--g-text-3)" }}
      >
        {row.note ?? ""}
      </span>
      <span
        style={{ display: "flex", justifyContent: "center", gap: 6 }}
        onClick={(e) => e.stopPropagation()}
      >
        <AddStageButton row={row} />
        <button title="Chỉnh sửa LSX" onClick={onEdit} style={actionBtn}>
          <Pencil size={13} />
        </button>
        <button
          title={
            row.stageId > 0
              ? `Xoá mục "${row.mucLabel}" của ${row.code} · ${row.categoryName}`
              : `Xoá phân loại "${row.categoryName}" của ${row.code}`
          }
          onClick={onDelete}
          style={{ ...actionBtn, color: "var(--g-short)" }}
        >
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

/**
 * Thêm một mục còn thiếu cho (LSX × phân loại) đang ở dòng này.
 * Dòng mục giờ là bản ghi thật nên không tự có sẵn đủ bốn.
 */
function AddStageButton({ row }: { row: GridRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (row.missingMucs.length === 0) {
    // Giữ chỗ để ba nút của mọi dòng luôn thẳng cột với nhau.
    return <span style={{ width: 32, flexShrink: 0 }} />;
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
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        title={`Thêm mục cho ${row.code} · ${row.categoryName}`}
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        style={{ ...actionBtn, color: "rgba(198,181,255,0.95)" }}
      >
        <Plus size={14} />
      </button>

      {open && (
        <div
          className="glass-card"
          style={{
            position: "absolute",
            top: 36,
            right: 0,
            zIndex: 30,
            borderRadius: 12,
            padding: 6,
            minWidth: 148,
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
              color: "var(--g-text-4)",
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
                borderRadius: 8,
                padding: "6px 8px",
                fontSize: 12.5,
                textAlign: "left",
                cursor: pending ? "default" : "pointer",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.08)")
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Plus size={12} style={{ color: "rgba(198,181,255,0.9)" }} />
              {MUC_LABEL[m]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9,
  background: "rgba(255,255,255,0.1)",
  border: "1px solid var(--g-line-4)",
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
        width: 15,
        height: 15,
        cursor: "pointer",
        accentColor: "var(--g-accent)",
      }}
    />
  );
}

/** Dòng chi tiết (định mức) + các đợt đã gửi của riêng chi tiết đó. */
function PartBlock({
  row,
  navId,
  part,
  columns,
  index,
  open,
  onToggle,
}: {
  row: GridRow;
  navId: string;
  part: GridChild;
  columns: SizeColumn[];
  index: number;
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
        className="glass-row glass-hover glass-row-in"
        style={{
          padding: "9px 0",
          fontSize: 13,
          alignItems: "center",
          borderTop: "1px solid var(--g-line-1)",
          outline: "none",
          ...stagger(index),
        }}
      >
        <span />
        <span />
        <span
          onClick={() => {
            nav.point(navId, ROW_LEVEL);
            onToggle();
          }}
          style={{
            gridColumn: `span ${LABEL_SPAN}`,
            paddingLeft: 28,
            color: "rgba(255,255,255,0.92)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            minWidth: 0,
          }}
        >
          <ChevronRight
            size={12}
            style={{
              flexShrink: 0,
              color: "var(--g-text-3)",
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform .15s",
            }}
          />
          <span className="truncate">{part.label}</span>
        </span>

        {part.cells.map((c, i) => (
          <EditCell
            key={i}
            rowId={navId}
            cell={c}
            col={i}
            save={(q) => setPartTarget(part.partId!, c.orderSizeId!, q)}
          />
        ))}

        <span style={{ textAlign: "center", fontWeight: 600, color: "#fff" }}>
          {part.total || "—"}
        </span>
        <span />
        <span style={{ fontSize: 12, color: "var(--g-text-4)" }}>
          {part.note}
        </span>
        <span />
      </div>

      {open && (
        <div className="glass-expand">
          {(part.batches ?? []).map((b, i) => (
            <ChildRow
              key={b.key}
              navId={`${navId}/${b.key}`}
              child={b}
              indent={56}
              index={i}
            />
          ))}
          <AddBatchRow
            row={row}
            columns={columns}
            partId={part.partId}
            indent={56}
            addId={`add:${navId}`}
          />
        </div>
      )}
    </>
  );
}

/** Dòng "đợt" — mỗi ô là một MovementItem, sửa được. */
function ChildRow({
  child,
  navId,
  indent,
  index,
}: {
  child: GridChild;
  navId: string;
  indent: number;
  index: number;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [pending, start] = useTransition();

  const remove = () => {
    if (!confirm(`Xoá "${child.label}" (ngày ${child.dateLabel})?`)) return;
    start(async () => {
      const res = await deleteBatch(child.movementId!);
      if (res.ok) {
        toast.success("Đã xoá đợt");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi khi xoá.");
    });
  };

  return (
    <div
      data-nav={navId}
      tabIndex={nav.tabIndex(navId, ROW_LEVEL)}
      onFocus={(e) =>
        e.target === e.currentTarget && nav.point(navId, ROW_LEVEL)
      }
      onClick={() => nav.point(navId, ROW_LEVEL)}
      className="glass-row glass-hover glass-row-in"
      style={{
        padding: "9px 0",
        fontSize: 13,
        color: "var(--g-text-2)",
        alignItems: "center",
        borderTop: "1px solid var(--g-line-1)",
        outline: "none",
        opacity: pending ? 0.4 : 1,
        ...stagger(index),
      }}
    >
      <span />
      <span />
      <span
        className="truncate"
        style={{
          gridColumn: `span ${LABEL_SPAN}`,
          paddingLeft: indent,
          color: "rgba(255,255,255,0.92)",
        }}
      >
        {child.label}
      </span>

      {child.cells.map((c, i) => (
        <EditCell
          key={i}
          rowId={navId}
          cell={c}
          col={i}
          save={(q) =>
            setItemQty(child.movementId!, c.orderSizeId!, child.partId, q)
          }
        />
      ))}

      <span style={{ textAlign: "center", fontWeight: 600, color: "#fff" }}>
        {child.total || "—"}
      </span>
      <EditDateCell
        iso={child.dateIso!}
        label={child.dateLabel}
        save={(iso) => setMovementDate(child.movementId!, iso)}
      />
      <span
        className="truncate"
        style={{ fontSize: 12, color: "var(--g-text-4)" }}
      >
        {child.note ?? ""}
      </span>
      <span style={{ display: "flex", justifyContent: "center" }}>
        <button
          onClick={remove}
          title="Xoá đợt này"
          style={{
            display: "flex",
            padding: 5,
            borderRadius: 7,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--g-text-4)",
          }}
        >
          <Trash2 size={13} />
        </button>
      </span>
    </div>
  );
}

function StaticCell({ cell, col }: { cell: Cell; col: number }) {
  const tone = toneOf(cell);
  return (
    <span
      className="glass-cell"
      data-col={col}
      style={{ textAlign: "center", color: TONE_COLOR[tone] }}
    >
      {cell.value || "—"}
    </span>
  );
}

/**
 * Ô ngày sửa tại chỗ. Dùng cho ngày tạo LSX (dòng cha) và ngày của đợt.
 * Ở dòng cha phải chặn click nổi lên, không thì bảng đóng/mở dòng.
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
        onClick={(e) => e.stopPropagation()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          else if (e.key === "Escape") setEditing(false);
        }}
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid var(--g-accent)",
          borderRadius: 7,
          padding: "3px 4px",
          fontSize: 11.5,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Bấm để sửa ngày"
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e) => e.key === "Enter" && setEditing(true)}
      style={{
        fontSize: 12,
        cursor: "pointer",
        color: "var(--g-text-3)",
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
  save,
}: {
  cell: Cell;
  col: number;
  rowId: string;
  save: (qty: number) => Promise<CellResult>;
}) {
  const router = useRouter();
  const nav = useContext(NavCtx);
  const [draft, setDraft] = useState("");
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

  // Mỗi lần ô mở ra là một lượt sửa mới: nạp lại nháp, xoá mọi cờ của lượt trước.
  useEffect(() => {
    if (!editing) return;
    cancelled.current = false;
    committed.current = false;
    setDraft(seed.current ?? (cell.value ? String(cell.value) : ""));
    seed.current = null;
    // `cell.value` cố ý không nằm trong deps: server refresh giữa chừng mà nạp
    // lại nháp thì chữ đang gõ dở bị nuốt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const tone = toneOf(cell);

  if (cell.orderSizeId == null) {
    return (
      <span
        className="glass-cell"
        data-col={col}
        style={{ textAlign: "center", color: "var(--g-dim)" }}
      >
        —
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
        style={{
          width: "100%",
          textAlign: "center",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid var(--g-accent)",
          borderRadius: 7,
          padding: "3px 2px",
          fontSize: 12,
          outline: "none",
        }}
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={nav.tabIndex(rowId, col)}
      title="Bấm để sửa"
      className="glass-cell"
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
        textAlign: "center",
        cursor: "pointer",
        outline: "none",
        color: TONE_COLOR[tone],
        opacity: pending ? 0.4 : 1,
      }}
    >
      {cell.value || "—"}
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
        className="glass-cell"
        data-col={col}
        style={{ textAlign: "center", color: "var(--g-dim)" }}
      >
        —
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
      style={{
        width: "100%",
        textAlign: "center",
        background: "rgba(255,255,255,0.05)",
        border: "1px dashed var(--g-line-3)",
        borderRadius: 7,
        padding: "6px 2px",
        fontSize: 12,
        outline: "none",
      }}
    />
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px dashed rgba(255,255,255,0.18)",
  borderRadius: 8,
  padding: "6px 10px",
  fontSize: 12,
  outline: "none",
  minWidth: 0,
  width: "100%",
};

/** Dòng "+ Thêm ..." lúc chưa mở — bấm vào mới hiện các ô nhập. */
function AddTrigger({
  label,
  indent,
  span,
  onOpen,
}: {
  label: string;
  indent: number;
  span: number;
  onOpen: () => void;
}) {
  return (
    <div
      className="glass-row glass-hover"
      onClick={onOpen}
      style={{
        padding: "7px 0",
        alignItems: "center",
        cursor: "pointer",
        borderTop: "1px solid var(--g-line-1)",
      }}
    >
      <span />
      <span style={{ display: "flex", justifyContent: "center", color: "rgba(198,181,255,0.8)" }}>
        <Plus size={14} />
      </span>
      <span
        style={{
          gridColumn: `span ${span}`,
          paddingLeft: indent,
          fontSize: 12.5,
          color: "rgba(198,181,255,0.8)",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** Nút huỷ ở cột cuối của dòng nhập. */
function CancelBtn({ onClick }: { onClick: () => void }) {
  return (
    <span style={{ display: "flex", justifyContent: "center" }}>
      <button
        onClick={onClick}
        title="Huỷ"
        style={{
          display: "flex",
          padding: 5,
          borderRadius: 7,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--g-text-4)",
        }}
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
        label="Thêm chi tiết..."
        indent={28}
        span={n + 8}
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
      className="glass-row glass-expand"
      style={{
        padding: "8px 0 4px",
        alignItems: "center",
        borderTop: "1px dashed var(--g-line-3)",
        opacity: pending ? 0.5 : 1,
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") close();
      }}
    >
      <span />
      <span style={{ display: "flex", justifyContent: "center", color: "rgba(198,181,255,0.8)" }}>
        <Plus size={15} />
      </span>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên chi tiết..."
        style={{
          ...inputStyle,
          gridColumn: `span ${LABEL_SPAN}`,
          marginLeft: 28,
          fontSize: 13,
        }}
      />
      {row.cells.map((c, i) => (
        <NumInput
          key={i}
          col={i}
          disabled={c.orderSizeId == null}
          value={qty[i]}
          onChange={(v) => setQty((s) => s.map((x, j) => (j === i ? v : x)))}
        />
      ))}
      <span style={{ textAlign: "center", color: "var(--g-text-4)" }}>
        {total || "—"}
      </span>
      <span />
      <span style={{ fontSize: 11.5, color: "var(--g-text-4)" }}>
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
  addId,
}: {
  row: GridRow;
  columns: SizeColumn[];
  partId: number | null;
  indent: number;
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

  if (!open) {
    return (
      <AddTrigger
        label="Thêm đợt..."
        indent={indent}
        span={n + 8}
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
      className="glass-row glass-expand"
      style={{
        padding: "8px 0 4px",
        alignItems: "center",
        borderTop: "1px dashed var(--g-line-3)",
        opacity: pending ? 0.5 : 1,
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        } else if (e.key === "Escape") close();
      }}
    >
      <span />
      <span style={{ display: "flex", justifyContent: "center", color: "rgba(198,181,255,0.8)" }}>
        <Plus size={15} />
      </span>
      <span
        style={{
          gridColumn: `span ${LABEL_SPAN}`,
          paddingLeft: indent,
          fontSize: 13,
          color: "var(--g-text-4)",
        }}
      >
        Đợt mới
      </span>
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
      <span style={{ textAlign: "center", color: "var(--g-text-4)" }}>
        {total || "—"}
      </span>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        title="Ngày của đợt"
        style={{ ...inputStyle, padding: "6px 6px" }}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Ghi chú"
        style={inputStyle}
      />
      <CancelBtn onClick={close} />
    </div>
  );
}
