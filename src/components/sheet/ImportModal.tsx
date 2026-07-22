"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ChevronRight, Plus, Trash2 } from "lucide-react";
import FormModal from "@/components/ui/FormModal";
import { importOrders, listSizeLabels, probeCodes } from "@/app/actions/grid";
import type { CodeStatus } from "@/lib/import";
import { listLines } from "@/app/actions/lines";
import {
  MUC_CHOICES,
  activeSizeIndexes,
  applyQty,
  draftTotal,
  draftsFromRows,
  parseTsv,
  validateDrafts,
  type ImportDraft,
  type Muc,
  type ParsedRow,
} from "@/lib/import-tsv";

/**
 * Nhập nhanh nhiều LSX bằng cách dán các dòng từ sheet quản lý sản xuất.
 *
 * Dán xong sẽ ra một bảng nháp sửa được: mỗi dòng là (LSX × Phân loại), nên
 * hàng "Bộ" tách thành hai dòng Áo/Quần độc lập. Số lượng thành SL kế hoạch
 * của mục được chọn (Nhận may / Nhận thêu). Nhánh mở rộng chi tiết bên dưới
 * là di sản của mục "Gửi may" đã bỏ — không còn kích hoạt được.
 */
export default function ImportModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [sizeLabels, setSizeLabels] = useState<string[]>([]);
  const [lineNames, setLineNames] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<ImportDraft[]>([]);
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const [existing, setExisting] = useState<Map<string, CodeStatus>>(new Map());
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    Promise.all([listSizeLabels(), listLines()])
      .then(([labels, lines]) => {
        setSizeLabels(labels);
        setLineNames(new Set(lines.map((l) => l.name)));
      })
      .catch(() => toast.error("Không nạp được danh mục."));
  }, [open]);

  const parsed: ParsedRow[] = useMemo(
    () => (text.trim() && sizeLabels.length ? parseTsv(text, sizeLabels) : []),
    [text, sizeLabels]
  );
  const badRows = parsed.filter((r) => r.error);

  // Dán lại thì dựng nháp mới; mọi chỉnh sửa trước đó bị bỏ.
  useEffect(() => {
    setDrafts(draftsFromRows(parsed));
    setOpenRows({});
  }, [parsed]);

  // Tra trước xem mã nào đã có, và đã có sẵn những mục nào.
  const codes = useMemo(
    () => [...new Set(parsed.filter((r) => !r.error).map((r) => r.code))],
    [parsed]
  );
  useEffect(() => {
    if (codes.length === 0) {
      setExisting(new Map());
      return;
    }
    let alive = true;
    probeCodes(codes)
      .then((list) => alive && setExisting(new Map(list.map((s) => [s.code, s]))))
      .catch(() => {
        /* mất tra cứu thì vẫn nhập được; server chặn trùng */
      });
    return () => {
      alive = false;
    };
  }, [codes]);

  /** LSX mới / thêm mục vào LSX đã có / bộ ba đã tồn tại. */
  const statusOf = (d: ImportDraft): "new" | "append" | "duplicate" => {
    const info = existing.get(d.code);
    if (!info) return "new";
    const mucs = info.categories[d.categoryName.toLowerCase()];
    if (!mucs) return "append";
    return mucs.includes(d.muc) ? "duplicate" : "append";
  };

  const dupes = drafts.filter((d) => statusOf(d) === "duplicate").length;
  const importable = drafts.length - dupes;

  const cols = useMemo(() => activeSizeIndexes(drafts), [drafts]);
  const newLines = useMemo(() => {
    const names = drafts.map((d) => d.lineName).filter(Boolean);
    return [...new Set(names.filter((n) => !lineNames.has(n)))];
  }, [drafts, lineNames]);

  const problem = drafts.length > 0 ? validateDrafts(drafts) : null;

  const patch = (i: number, next: Partial<ImportDraft>) =>
    setDrafts((ds) => ds.map((d, k) => (k === i ? { ...d, ...next } : d)));

  const submit = () =>
    start(async () => {
      const res = await importOrders(drafts);
      if (!res.ok || !res.result) {
        toast.error(res.error ?? "Lỗi khi nhập.");
        return;
      }
      const { createdOrders, addedStages, skipped, newLines: made, newPartTypes } =
        res.result;
      if (addedStages.length === 0) {
        toast.error(`Không nhập được dòng nào. Bỏ qua ${skipped.length} dòng.`);
        return;
      }
      const extra = [
        createdOrders.length ? `${createdOrders.length} LSX mới` : null,
        skipped.length ? `bỏ qua ${skipped.length} dòng` : null,
        made.length ? `thêm ${made.length} chuyền` : null,
        newPartTypes.length ? `thêm ${newPartTypes.length} chi tiết vào danh mục` : null,
      ]
        .filter(Boolean)
        .join(", ");
      toast.success(
        `Đã nhập ${addedStages.length} mục${extra ? ` (${extra})` : ""}.`
      );
      if (skipped.length === 0) {
        setText("");
        onOpenChange(false);
      }
      router.refresh();
    });

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      sheet
      wide
      title="Nhập nhanh LSX"
      description="Dán các dòng từ sheet, soát lại rồi nhập."
    >
      <div className="space-y-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder="Dán vào đây — mỗi dòng một LSX, các cột ngăn bằng Tab."
          className="thin-scroll h-24 w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-xs outline-none focus:border-brand-line"
        />

        {drafts.length === 0 && badRows.length === 0 ? (
          <p className="text-xs text-muted">
            Cột được dò tự động theo Đơn vị và Danh mục, nên lệch vài cột vẫn
            nhận đúng. Khối size khớp {sizeLabels.length} size trong danh mục. Đơn
            vị <b className="text-ink">Bộ</b> tách thành hai dòng Áo và Quần, sửa
            độc lập nhau.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Chip>
                <b className="text-ink">{importable}</b> dòng sẽ nhập
              </Chip>
              {dupes > 0 && (
                <Chip tone="bad">
                  <AlertTriangle size={12} /> {dupes} dòng đã tồn tại, sẽ bỏ qua
                </Chip>
              )}
              {badRows.length > 0 && (
                <Chip tone="bad">
                  <AlertTriangle size={12} /> {badRows.length} dòng bị loại
                </Chip>
              )}
              {newLines.length > 0 && (
                <Chip tone="accent">
                  {newLines.length} chuyền mới: {newLines.join(", ")}
                </Chip>
              )}
            </div>

            {badRows.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-line bg-surface p-3 text-xs">
                {badRows.map((r) => (
                  <li key={r.index} className="flex gap-2 text-short">
                    <AlertTriangle size={13} className="mt-px shrink-0" />
                    <span>
                      Dòng {r.index}
                      {r.code ? ` (${r.code})` : ""}: {r.error}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {drafts.length > 0 && (
              <div className="thin-scroll max-h-[46vh] overflow-auto rounded-xl border border-line">
                <table className="dt">
                  <thead>
                    <tr>
                      <th className="w-8" />
                      <th>Tình trạng</th>
                      <th>Mã LSX</th>
                      <th>Sản phẩm</th>
                      <th>Phân loại</th>
                      <th>Chuyền may</th>
                      <th>Mục</th>
                      {cols.map((i) => (
                        <th key={i} className="!px-1 !text-center">
                          {sizeLabels[i]}
                        </th>
                      ))}
                      <th className="!text-right">Tổng</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d, i) => (
                      <DraftRows
                        key={`${d.code}-${d.categoryName}-${i}`}
                        draft={d}
                        cols={cols}
                        status={statusOf(d)}
                        lineIsNew={!!d.lineName && !lineNames.has(d.lineName)}
                        open={!!openRows[i]}
                        onToggle={() =>
                          setOpenRows((s) => ({ ...s, [i]: !s[i] }))
                        }
                        onPatch={(next) => patch(i, next)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-muted">
              Mỗi dòng tạo đúng <b className="text-ink">một mục</b>. Mã LSX đã có
              thì dòng được <b className="text-ink">ghép thêm mục</b> vào nó, chỉ
              bỏ qua khi trùng cả LSX + phân loại + mục. Số lượng dán vào là{" "}
              <b className="text-ink">SL kế hoạch</b>, không phải hàng đã
              nhận — import không tạo đợt nào cả.
            </p>
          </>
        )}

        {problem && (
          <p className="flex items-center gap-2 text-xs text-short">
            <AlertTriangle size={13} /> {problem}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-xl border border-line px-4 py-2 text-sm font-medium text-muted"
          >
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={pending || importable === 0 || !!problem}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-40"
          >
            {pending ? "Đang nhập…" : `Nhập ${importable} dòng`}
          </button>
        </div>
      </div>
    </FormModal>
  );
}

/** Một dòng nháp, cộng các dòng chi tiết khi mở rộng. */
function DraftRows({
  draft,
  cols,
  status,
  lineIsNew,
  open,
  onToggle,
  onPatch,
}: {
  draft: ImportDraft;
  cols: number[];
  status: "new" | "append" | "duplicate";
  lineIsNew: boolean;
  open: boolean;
  onToggle: () => void;
  onPatch: (next: Partial<ImportDraft>) => void;
}) {
  const expandable = draft.muc === "SEW_OUT" && status !== "duplicate";
  const dim = status === "duplicate";

  const setQty = (si: number, v: number) => {
    const next = applyQty(draft, si, v);
    onPatch({ qty: next.qty, parts: next.parts });
  };

  const setPart = (pi: number, next: Partial<{ name: string; qty: number[] }>) =>
    onPatch({
      parts: draft.parts.map((p, k) => (k === pi ? { ...p, ...next } : p)),
    });

  const addPart = () =>
    onPatch({
      parts: [...draft.parts, { name: "", qty: [...draft.qty] }],
    });

  const removePart = (pi: number) =>
    onPatch({ parts: draft.parts.filter((_, k) => k !== pi) });

  return (
    <>
      <tr style={dim ? { opacity: 0.45 } : undefined}>
        <td className="!pr-0">
          {expandable ? (
            <button
              onClick={onToggle}
              title={open ? "Thu gọn" : "Xem chi tiết"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronRight
                size={14}
                className="transition-transform"
                style={{ transform: open ? "rotate(90deg)" : undefined }}
              />
            </button>
          ) : null}
        </td>
        <td>
          <StatusBadge status={status} />
        </td>
        <td className="nums font-semibold">{draft.code}</td>
        <td className="max-w-[14rem] truncate">{draft.productName}</td>
        <td>{draft.categoryName}</td>
        <td>
          {draft.lineName ? (
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              {draft.lineName}
              {lineIsNew && (
                <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                  mới
                </span>
              )}
            </span>
          ) : (
            <span className="text-faint">chưa gán</span>
          )}
        </td>
        <td>
          <select
            value={draft.muc}
            onChange={(e) => onPatch({ muc: e.target.value as Muc })}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs outline-none focus:border-brand-line"
          >
            {MUC_CHOICES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </td>
        {cols.map((si) => (
          <td key={si} className="!px-1">
            <NumCell value={draft.qty[si]} onChange={(v) => setQty(si, v)} />
          </td>
        ))}
        <td className="num font-semibold">{draftTotal(draft.qty)}</td>
      </tr>

      {expandable && open && (
        <>
          <tr>
            <td />
            <td colSpan={6 + cols.length} className="!py-1.5 text-[11px] uppercase tracking-wide text-brand">
              Chi tiết bán thành phẩm · định mức theo size
            </td>
            <td />
          </tr>

          {draft.parts.map((p, pi) => (
            <tr key={pi}>
              <td />
              <td colSpan={6} className="!py-1.5">
                <div className="flex items-center gap-2 pl-3">
                  <input
                    value={p.name}
                    onChange={(e) => setPart(pi, { name: e.target.value })}
                    placeholder="Tên chi tiết"
                    className="w-56 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs outline-none focus:border-brand-line"
                  />
                  <button
                    onClick={() => removePart(pi)}
                    title="Xoá chi tiết"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-faint hover:bg-surface-2 hover:text-short"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
              {cols.map((si) => (
                <td key={si} className="!px-1 !py-1.5">
                  <NumCell
                    value={p.qty[si]}
                    onChange={(v) =>
                      setPart(pi, {
                        qty: p.qty.map((q, k) => (k === si ? v : q)),
                      })
                    }
                  />
                </td>
              ))}
              <td className="num !py-1.5 text-muted">{draftTotal(p.qty)}</td>
            </tr>
          ))}

          <tr>
            <td />
            <td colSpan={7 + cols.length} className="!py-1.5">
              <button
                onClick={addPart}
                className="ml-3 flex items-center gap-1.5 rounded-lg border border-dashed border-line px-2.5 py-1 text-xs text-muted hover:text-ink"
              >
                <Plus size={13} /> Thêm chi tiết
              </button>
            </td>
          </tr>
        </>
      )}
    </>
  );
}

function NumCell({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      inputMode="numeric"
      value={value === 0 ? "" : String(value)}
      placeholder="0"
      onChange={(e) => {
        const clean = e.target.value.replace(/[^\d]/g, "");
        onChange(clean === "" ? 0 : parseInt(clean, 10));
      }}
      className="nums w-12 rounded-md border border-line bg-surface-2 px-1 py-1 text-center text-xs outline-none focus:border-brand-line"
    />
  );
}

/** Dòng này sẽ tạo LSX mới, ghép thêm mục vào LSX cũ, hay bị bỏ qua. */
function StatusBadge({ status }: { status: "new" | "append" | "duplicate" }) {
  const map = {
    new: { label: "LSX mới", cls: "bg-brand-soft text-brand" },
    append: { label: "Thêm mục", cls: "bg-ok-soft text-ok" },
    duplicate: { label: "Đã có", cls: "bg-short-soft text-short" },
  }[status];
  return (
    <span
      className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium ${map.cls}`}
    >
      {map.label}
    </span>
  );
}

function Chip({
  tone = "plain",
  children,
}: {
  tone?: "plain" | "bad" | "accent";
  children: React.ReactNode;
}) {
  const cls = {
    plain: "border-line bg-surface text-muted",
    bad: "border-transparent bg-short-soft text-short",
    accent: "border-transparent bg-brand-soft text-brand",
  }[tone];
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium ${cls}`}
    >
      {children}
    </span>
  );
}
