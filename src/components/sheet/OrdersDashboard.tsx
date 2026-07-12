"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  Grid3x3,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import type { MovementType } from "@prisma/client";
import { exportGridXlsx } from "@/app/actions/export";
import { downloadBase64 } from "./download";
import { MUC_LABEL, MUC_TYPES, type GridPage } from "@/lib/grid-types";
import OrderFormModal from "@/components/forms/OrderFormModal";
import OrdersGrid from "./OrdersGrid";
import SheetSettings from "./SheetSettings";
import SystemModal from "./SystemModal";
import ImportModal from "./ImportModal";
import HotkeyHelp from "./HotkeyHelp";
import { isComposing, isPlainKey, useHotkeys } from "@/lib/hotkeys";
import {
  SHEET_DEFAULTS,
  readSheetPrefs,
  writeSheetPrefs,
  type SheetPrefs,
} from "./prefs";

export default function OrdersDashboard({ data }: { data: GridPage }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [prefs, setPrefs] = useState<SheetPrefs | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [systemOpen, setSystemOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exporting, startExport] = useTransition();
  const gearRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /** Xuất mọi dòng khớp bộ lọc hiện tại — không chỉ trang đang xem. */
  const exportFiltered = () =>
    startExport(async () => {
      const res = await exportGridXlsx({
        mode: "filtered",
        filters: {
          q: params.get("q") ?? undefined,
          day: params.get("day") ?? undefined,
          muc: (params.get("muc") as MovementType) || undefined,
          sort: (params.get("sort") as "code") || undefined,
          dir: params.get("dir") === "asc" ? "asc" : "desc",
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      downloadBase64(res.fileName, res.base64);
      toast.success(`Đã xuất ${res.rows} dòng ra ${res.fileName}`);
    });

  // Lệnh toàn trang. `OrdersGrid` gắn listener trước (con mount trước cha) và
  // `preventDefault` phím của nó, nên bảng luôn được quyền ưu tiên.
  useHotkeys((e) => {
    if (!isPlainKey(e)) return;
    switch (e.key) {
      case "/":
        searchRef.current?.focus();
        searchRef.current?.select();
        break;
      case "n":
        setNewOrderOpen(true);
        break;
      case "i":
        setImportOpen(true);
        break;
      case "e":
        exportFiltered();
        break;
      case "?":
        setHelpOpen(true);
        break;
      case "Escape":
        if (!settingsOpen) return;
        setSettingsOpen(false);
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // Đọc ở effect chứ không phải lúc render: localStorage không có trên server,
  // đọc lúc render sẽ lệch giữa HTML server và lần vẽ đầu ở client.
  useEffect(() => setPrefs(readSheetPrefs()), []);
  useEffect(() => {
    if (prefs) writeSheetPrefs(prefs);
  }, [prefs]);

  // Ghi lên documentElement chứ không phải div của bảng: modal portal ra <body>
  // nên chỉ với tới được biến ở gốc — có thế `.sheet-card` mới đổi màu theo.
  useEffect(() => {
    if (!prefs) return;
    document.documentElement.style.setProperty("--s-accent", prefs.accent);
  }, [prefs]);

  // Bấm ra ngoài thì đóng popover
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!gearRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [settingsOpen]);

  /** Đổi 1 tham số URL, giữ nguyên phần còn lại. Đổi filter thì về trang 1. */
  const setParam = useCallback(
    (key: string, value: string | null, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      if (resetPage && key !== "page") next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  // Lần vẽ đầu (trước effect) dùng mặc định để server và client khớp nhau.
  const p = prefs ?? SHEET_DEFAULTS;

  return (
    <div
      className="sheet-scope min-h-dvh"
      data-compact={p.compact ? "1" : "0"}
      data-banded={p.banded ? "1" : "0"}
      style={{
        ["--s-accent" as string]: p.accent,
        padding: "22px 26px 40px",
      }}
    >
      <div className="sheet-card-outer mx-auto" style={{ maxWidth: 1560 }}>
        {/* 1 · Thanh tiêu đề */}
        <div
          className="flex items-center"
          style={{
            gap: 12,
            padding: "14px 18px",
            background: "var(--s-accent)",
            color: "#fff",
          }}
        >
          <span
            className="flex items-center justify-center"
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: 4,
              background: "rgba(255,255,255,.16)",
            }}
          >
            <Grid3x3 size={15} />
          </span>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: ".2px" }}>
            Danh sách Lệnh sản xuất
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.82 }}>
            Quản lý theo Lệnh · Mục · Đợt nhận
          </span>
        </div>

        {/* 2 · Thanh lệnh */}
        <div
          className="flex flex-wrap items-center"
          style={{
            gap: 10,
            padding: "11px 16px",
            background: "var(--s-bar)",
            borderBottom: "1px solid var(--s-bar-line)",
          }}
        >
          <SearchBox
            inputRef={searchRef}
            initial={params.get("q") ?? ""}
            onCommit={(v) => setParam("q", v || null)}
          />

          <input
            type="date"
            value={params.get("day") ?? ""}
            onChange={(e) => setParam("day", e.target.value || null)}
            title="Lọc theo ngày có phiếu"
            style={{ ...control, width: 140 }}
          />

          <select
            value={params.get("muc") ?? ""}
            onChange={(e) => setParam("muc", e.target.value || null)}
            style={control}
          >
            <option value="">Tất cả mục</option>
            {MUC_TYPES.map((m) => (
              <option key={m} value={m}>
                {MUC_LABEL[m]}
              </option>
            ))}
          </select>

          <select
            value={String(data.perPage)}
            onChange={(e) => setParam("per", e.target.value)}
            title="Số LSX mỗi trang"
            style={control}
          >
            <option value="10">10 LSX</option>
            <option value="20">20 LSX</option>
            <option value="50">50 LSX</option>
          </select>

          <div className="flex items-center" style={{ marginLeft: "auto", gap: 8 }}>
            <button
              onClick={exportFiltered}
              disabled={exporting}
              title="Xuất mọi dòng khớp bộ lọc hiện tại (tất cả các trang) ra Excel"
              style={{
                ...btn,
                cursor: exporting ? "default" : "pointer",
                opacity: exporting ? 0.6 : 1,
              }}
            >
              <Download size={14} /> {exporting ? "Đang xuất…" : "Xuất Excel"}
            </button>

            <button
              onClick={() => setImportOpen(true)}
              title="Dán nhiều dòng từ sheet để tạo LSX hàng loạt"
              style={btn}
            >
              <ClipboardPaste size={14} /> Nhập nhanh
            </button>

            <button
              onClick={() => setNewOrderOpen(true)}
              style={{
                ...btn,
                background: "var(--s-accent)",
                border: "1px solid var(--s-accent)",
                color: "#fff",
                fontWeight: 600,
              }}
            >
              <Plus size={14} /> Tạo LSX
            </button>

            <div ref={gearRef} style={{ position: "relative" }}>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                title="Tuỳ chỉnh hiển thị"
                style={{
                  ...btn,
                  width: 34,
                  padding: 0,
                  justifyContent: "center",
                  color: "#5a635c",
                }}
              >
                <Settings size={15} />
              </button>

              {settingsOpen && (
                <SheetSettings
                  prefs={p}
                  onChange={setPrefs}
                  onOpenSystem={() => {
                    setSettingsOpen(false);
                    setSystemOpen(true);
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* 3 · Bảng */}
        <OrdersGrid orders={data.orders} columns={data.columns} />

        {/* 4 · Chân bảng */}
        <Footer
          total={data.total}
          rowCount={data.rowCount}
          page={data.page}
          totalPages={data.totalPages}
          onGo={(nx) => setParam("page", nx > 1 ? String(nx) : null, false)}
        />
      </div>

      <HotkeyHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <SystemModal open={systemOpen} onOpenChange={setSystemOpen} />
      <ImportModal open={importOpen} onOpenChange={setImportOpen} />
      <OrderFormModal open={newOrderOpen} onOpenChange={setNewOrderOpen} sheet />
    </div>
  );
}

const control: React.CSSProperties = {
  background: "#fff",
  border: "1px solid var(--s-card-line)",
  borderRadius: 4,
  padding: "7px 10px",
  fontSize: 13,
  outline: "none",
};

const btn: React.CSSProperties = {
  ...control,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  flexShrink: 0,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

/**
 * Ô tìm kiếm. Chỉ tìm khi bấm Enter.
 *
 * Trước đây gõ tới đâu tìm tới đó (debounce 300ms): mỗi nhịp ngừng tay là một
 * lượt truy vấn DB rồi render lại cả bảng, gõ "LSX2607020" nghĩa là vài lượt như
 * thế chồng lên nhau — bảng giật, mà chín phần mười kết quả trên đường đi chẳng
 * ai đọc. Người dùng biết lúc nào mình gõ xong; để họ nói.
 */
function SearchBox({
  initial,
  onCommit,
  inputRef,
}: {
  initial: string;
  onCommit: (v: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState(initial);
  // Nút Back / xoá bộ lọc đổi URL — ô phải chạy theo, không thì nó nói một đằng
  // mà bảng hiện một nẻo.
  useEffect(() => setValue(initial), [initial]);

  const dirty = value.trim() !== initial;

  return (
    <div style={{ position: "relative", flex: "0 0 300px" }}>
      <Search
        size={14}
        style={{
          position: "absolute",
          left: 9,
          top: "50%",
          transform: "translateY(-50%)",
          color: "#8a938c",
          pointerEvents: "none",
        }}
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Bộ gõ tiếng Việt dùng Enter để CHỐT DẤU. Cướp mất thì gõ "Áo" xong
          // bấm Enter là mất dấu, mà lại còn đi tìm cái tên sai ấy.
          if (isComposing(e)) return;

          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(value.trim());
          } else if (e.key === "Escape") {
            // Bỏ những gì đang gõ dở, về đúng cái đang tìm. Không nuốt phím:
            // `useHotkeys` còn nhả nét ra khỏi ô sau đó.
            setValue(initial);
          }
        }}
        placeholder="Tìm LSX, tên... ( / )"
        style={{
          ...control,
          width: "100%",
          padding: `7px ${dirty ? 52 : 10}px 7px 28px`,
        }}
      />

      {/* Gõ xong mà bảng chưa đổi thì trông như treo — nói thẳng ra là còn thiếu Enter. */}
      {dirty && (
        <kbd
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            padding: "1px 5px",
            borderRadius: 3,
            border: "1px solid var(--s-card-line)",
            background: "#fff",
            fontSize: 10,
            fontFamily: "inherit",
            color: "var(--s-muted)",
            whiteSpace: "nowrap",
          }}
        >
          Enter ↵
        </kbd>
      )}
    </div>
  );
}

function Footer({
  total,
  rowCount,
  page,
  totalPages,
  onGo,
}: {
  total: number;
  rowCount: number;
  page: number;
  totalPages: number;
  onGo: (page: number) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center"
      style={{
        gap: 14,
        padding: "9px 16px",
        background: "var(--s-bar)",
        borderTop: "1px solid var(--s-bar-line)",
        fontSize: 12,
        color: "var(--s-ink-2)",
      }}
    >
      <span>
        <b>{total}</b> lệnh sản xuất
      </span>
      <span style={{ color: "#c1c7c2" }}>|</span>
      <span>
        <b>{rowCount}</b> mục hiển thị
      </span>

      <div className="flex items-center" style={{ marginLeft: "auto", gap: 10 }}>
        {totalPages > 1 && (
          <div className="flex items-center" style={{ gap: 6 }}>
            <PagerBtn disabled={page <= 1} onClick={() => onGo(page - 1)}>
              <ChevronLeft size={14} />
            </PagerBtn>
            <span>
              Trang <b>{page}</b> / {totalPages}
            </span>
            <PagerBtn
              disabled={page >= totalPages}
              onClick={() => onGo(page + 1)}
            >
              <ChevronRight size={14} />
            </PagerBtn>
          </div>
        )}
        <span style={{ color: "var(--s-muted)" }}>
          Nhấp ▸ để xem Mục → Đợt nhận · <b>?</b> xem phím tắt
        </span>
      </div>
    </div>
  );
}

function PagerBtn({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26,
        height: 26,
        borderRadius: 3,
        background: "#fff",
        border: "1px solid var(--s-card-line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
