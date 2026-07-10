"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Download,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import type { MovementType } from "@prisma/client";
import { exportGridXlsx } from "@/app/actions/export";
import { downloadBase64 } from "./download";
import { MUC_LABEL, MUC_TYPES, type GridPage } from "@/lib/grid-types";
import OrderFormModal from "@/components/forms/OrderFormModal";
import LsxGrid from "./LsxGrid";
import GlassSettings from "./GlassSettings";
import GlassSystemModal from "./GlassSystemModal";
import ImportModal from "./ImportModal";
import HotkeyHelp from "./HotkeyHelp";
import { isPlainKey, useHotkeys } from "@/lib/hotkeys";
import {
  GLASS_DEFAULTS,
  PANEL_INSET,
  readGlassPrefs,
  writeGlassPrefs,
  type GlassPrefs,
} from "./prefs";

export default function GlassDashboard({ data }: { data: GridPage }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [prefs, setPrefs] = useState<GlassPrefs | null>(null);
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

  // Lệnh toàn trang. `LsxGrid` gắn listener trước (con mount trước cha) và
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
  useEffect(() => setPrefs(readGlassPrefs()), []);
  useEffect(() => {
    if (prefs) writeGlassPrefs(prefs);
  }, [prefs]);

  // Ghi lên documentElement chứ không phải div của panel: modal portal ra
  // <body> nên chỉ với tới được biến ở gốc.
  useEffect(() => {
    if (!prefs) return;
    const s = document.documentElement.style;
    s.setProperty("--g-blur", `${prefs.blur}px`);
    s.setProperty("--g-tint", prefs.tint);
    s.setProperty("--g-opacity", String(prefs.opacity));
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

  const readBgFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Chỉ nhận file ảnh.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setPrefs((p) => ({ ...(p ?? GLASS_DEFAULTS), bgUrl: url }));
    };
    reader.readAsDataURL(file);
  };

  // Lần vẽ đầu (trước effect) dùng mặc định để server và client khớp nhau.
  const p = prefs ?? GLASS_DEFAULTS;

  return (
    <div
      className="glass-scope relative flex min-h-dvh items-center justify-center overflow-hidden p-12"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) readBgFile(f);
      }}
    >
      {/* Nền */}
      <div
        className="absolute inset-0 z-0 bg-cover bg-center"
        style={{ backgroundImage: `url("${p.bgUrl ?? "/bg-default.png"}")` }}
      />
      {/* Lớp làm tối nền */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: `rgba(0,0,0,${p.scrim})` }}
      />

      {/* Khối kính */}
      <div
        className="glass-panel relative z-10 flex flex-col overflow-hidden"
        style={{
          // 100% = kín trang (trừ lề). Không còn trần 1280×820 cố định.
          width: `calc((100vw - ${PANEL_INSET}px) * ${p.widthPct / 100})`,
          height: `calc((100vh - ${PANEL_INSET}px) * ${p.heightPct / 100})`,
          borderRadius: 24,
          padding: "26px 30px",
          transition: "width .15s ease, height .15s ease",
        }}
      >
        <div className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-[14px]">
          <span
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-.3px",
              marginRight: "auto",
            }}
          >
            Danh sách Lệnh sản xuất
          </span>

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
            style={controlStyle}
          />

          <select
            value={params.get("muc") ?? ""}
            onChange={(e) => setParam("muc", e.target.value || null)}
            style={controlStyle}
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
            style={controlStyle}
          >
            <option value="10">10 LSX</option>
            <option value="20">20 LSX</option>
            <option value="50">50 LSX</option>
          </select>

          <button
            onClick={exportFiltered}
            disabled={exporting}
            title="Xuất mọi dòng khớp bộ lọc hiện tại (tất cả các trang) ra Excel"
            style={{
              ...controlStyle,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: exporting ? "default" : "pointer",
              flexShrink: 0,
              fontWeight: 500,
              opacity: exporting ? 0.6 : 1,
            }}
          >
            <Download size={15} /> {exporting ? "Đang xuất…" : "Xuất Excel"}
          </button>

          <button
            onClick={() => setImportOpen(true)}
            title="Dán nhiều dòng từ sheet để tạo LSX hàng loạt"
            style={{
              ...controlStyle,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              flexShrink: 0,
              fontWeight: 500,
            }}
          >
            <ClipboardPaste size={15} /> Nhập nhanh
          </button>

          <button
            onClick={() => setNewOrderOpen(true)}
            style={{
              ...controlStyle,
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              flexShrink: 0,
              fontWeight: 500,
            }}
          >
            <Plus size={15} /> Tạo LSX
          </button>

          <div ref={gearRef} className="relative">
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              title="Tùy chỉnh giao diện"
              style={{
                ...controlStyle,
                width: 40,
                height: 40,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <Settings size={17} />
            </button>

            {settingsOpen && (
              <GlassSettings
                prefs={p}
                onChange={setPrefs}
                onPickFile={readBgFile}
                onOpenSystem={() => {
                  setSettingsOpen(false);
                  setSystemOpen(true);
                }}
              />
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1">
          <LsxGrid rows={data.rows} columns={data.columns} />
        </div>

        <Pager
          page={data.page}
          totalPages={data.totalPages}
          total={data.total}
          rows={data.rows.length}
          onGo={(n) => setParam("page", n > 1 ? String(n) : null, false)}
        />
      </div>

      <HotkeyHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <GlassSystemModal open={systemOpen} onOpenChange={setSystemOpen} />
      <ImportModal open={importOpen} onOpenChange={setImportOpen} />
      <OrderFormModal
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        glass
      />
    </div>
  );
}

const controlStyle: React.CSSProperties = {
  background: "var(--g-fill)",
  border: "1px solid var(--g-line-3)",
  borderRadius: 12,
  padding: "9px 12px",
  fontSize: 13,
  outline: "none",
};

/** Ô tìm kiếm có debounce, đẩy vào URL sau khi ngừng gõ. */
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
  useEffect(() => setValue(initial), [initial]);

  useEffect(() => {
    if (value === initial) return;
    const t = setTimeout(() => onCommit(value.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div
      className="flex items-center gap-[9px]"
      style={{
        width: "min(260px,100%)",
        background: "var(--g-fill)",
        border: "1px solid var(--g-line-3)",
        borderRadius: 12,
        padding: "9px 13px",
      }}
    >
      <Search size={14} style={{ flexShrink: 0, color: "var(--g-text-4)" }} />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tìm LSX, sản phẩm... ( / )"
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: 13,
        }}
      />
    </div>
  );
}

function Pager({
  page,
  totalPages,
  total,
  rows,
  onGo,
}: {
  page: number;
  totalPages: number;
  total: number;
  rows: number;
  onGo: (page: number) => void;
}) {
  return (
    <div
      className="flex flex-shrink-0 items-center justify-between pt-3"
      style={{
        borderTop: "1px solid var(--g-line-1)",
        marginTop: 6,
        fontSize: 12,
        color: "var(--g-text-3)",
      }}
    >
      <span>
        <b style={{ color: "#fff" }}>{rows}</b> dòng · {total} LSX
      </span>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <PagerBtn disabled={page <= 1} onClick={() => onGo(page - 1)}>
            <ChevronLeft size={15} />
          </PagerBtn>
          <span>
            Trang <b style={{ color: "#fff" }}>{page}</b> / {totalPages}
          </span>
          <PagerBtn
            disabled={page >= totalPages}
            onClick={() => onGo(page + 1)}
          >
            <ChevronRight size={15} />
          </PagerBtn>
        </div>
      )}
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
        width: 30,
        height: 30,
        borderRadius: 9,
        background: "var(--g-fill)",
        border: "1px solid var(--g-line-3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </button>
  );
}
