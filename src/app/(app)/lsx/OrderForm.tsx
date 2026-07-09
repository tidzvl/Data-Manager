"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, Trash2, Layers } from "lucide-react";
import QtyInput from "@/components/QtyInput";
import PromptDialog from "@/components/ui/PromptDialog";
import { saveOrder, type OrderInput } from "@/app/actions/orders";
import { createLine } from "@/app/actions/lines";
import {
  createSizeType,
  createPartType,
  type SizeTypeDto,
  type PartTypeDto,
} from "@/app/actions/types";

type SizeRow = { id?: number; sizeLabel: string; targetQty: number };
type PartRow = {
  id?: number;
  name: string;
  color: string | null;
  targets: number[];
};
type CatRow = { id?: number; name: string; sizes: SizeRow[]; parts: PartRow[] };

export type OrderFormInitial = {
  id?: number;
  code: string;
  productName: string;
  lineId: number | null;
  note: string;
  status: "ACTIVE" | "DONE";
  categories: CatRow[];
};

export default function OrderForm({
  initial,
  lines: initialLines,
  sizeTypes: initialSizeTypes,
  partTypes: initialPartTypes,
  onSaved,
  onCancel,
}: {
  initial: OrderFormInitial;
  lines: { id: number; name: string }[];
  sizeTypes: SizeTypeDto[];
  partTypes: PartTypeDto[];
  /** Có = đang chạy trong modal: không điều hướng, để nơi gọi tự xử lý. */
  onSaved?: (id: number) => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const embedded = !!onSaved;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(initial.code);
  const [productName, setProductName] = useState(initial.productName);
  const [lineId, setLineId] = useState<number | null>(initial.lineId);
  const [note, setNote] = useState(initial.note);
  const [cats, setCats] = useState<CatRow[]>(
    initial.categories.length
      ? initial.categories
      : [{ name: "Áo", sizes: [], parts: [] }]
  );

  const [lines, setLines] = useState(initialLines);
  const [sizeTypes, setSizeTypes] = useState(initialSizeTypes);
  const [partTypes, setPartTypes] = useState(initialPartTypes);

  const [addLineOpen, setAddLineOpen] = useState(false);
  const [newSizeFor, setNewSizeFor] = useState<number | null>(null);
  const [newPartFor, setNewPartFor] = useState<number | null>(null);

  const updateCat = (ci: number, patch: Partial<CatRow>) =>
    setCats((cs) => cs.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  const addCat = () =>
    setCats((cs) => [...cs, { name: "", sizes: [], parts: [] }]);
  const removeCat = (ci: number) =>
    setCats((cs) => cs.filter((_, i) => i !== ci));

  const addSize = (ci: number, label: string) =>
    setCats((cs) =>
      cs.map((c, i) => {
        if (i !== ci || c.sizes.some((s) => s.sizeLabel === label)) return c;
        return {
          ...c,
          sizes: [...c.sizes, { sizeLabel: label, targetQty: 0 }],
          parts: c.parts.map((p) => ({ ...p, targets: [...p.targets, 0] })),
        };
      })
    );
  const removeSize = (ci: number, si: number) =>
    setCats((cs) =>
      cs.map((c, i) =>
        i !== ci
          ? c
          : {
              ...c,
              sizes: c.sizes.filter((_, j) => j !== si),
              parts: c.parts.map((p) => ({
                ...p,
                targets: p.targets.filter((_, j) => j !== si),
              })),
            }
      )
    );
  const updateSize = (ci: number, si: number, patch: Partial<SizeRow>) =>
    setCats((cs) =>
      cs.map((c, i) =>
        i !== ci
          ? c
          : {
              ...c,
              sizes: c.sizes.map((s, j) => (j === si ? { ...s, ...patch } : s)),
            }
      )
    );

  const addPart = (ci: number, type: PartTypeDto) =>
    setCats((cs) =>
      cs.map((c, i) => {
        if (i !== ci || c.parts.some((p) => p.name === type.name)) return c;
        return {
          ...c,
          parts: [
            ...c.parts,
            {
              name: type.name,
              color: type.color,
              // prefill = SL kế hoạch từng size
              targets: c.sizes.map((s) => s.targetQty),
            },
          ],
        };
      })
    );
  const removePart = (ci: number, pi: number) =>
    setCats((cs) =>
      cs.map((c, i) =>
        i !== ci ? c : { ...c, parts: c.parts.filter((_, j) => j !== pi) }
      )
    );
  const setPartTarget = (ci: number, pi: number, si: number, v: number) =>
    setCats((cs) =>
      cs.map((c, i) =>
        i !== ci
          ? c
          : {
              ...c,
              parts: c.parts.map((p, j) =>
                j !== pi
                  ? p
                  : {
                      ...p,
                      targets: p.targets.map((t, k) => (k === si ? v : t)),
                    }
              ),
            }
      )
    );

  const doAddLine = (name: string) =>
    startTransition(async () => {
      const res = await createLine(name);
      if (res.ok && res.line) {
        setLines((ls) =>
          ls.some((l) => l.id === res.line!.id) ? ls : [...ls, res.line!]
        );
        setLineId(res.line.id);
        toast.success("Đã thêm chuyền may");
      } else toast.error(res.error ?? "Lỗi");
    });

  const doAddSizeType = (label: string) => {
    const ci = newSizeFor;
    if (ci == null) return;
    startTransition(async () => {
      const res = await createSizeType(label);
      if (res.ok && res.item) {
        setSizeTypes((ts) =>
          ts.some((t) => t.id === res.item!.id) ? ts : [...ts, res.item!]
        );
        addSize(ci, res.item.label);
        toast.success(`Đã thêm kích thước "${res.item.label}"`);
      } else toast.error(res.error ?? "Lỗi");
    });
  };

  const doAddPartType = (name: string) => {
    const ci = newPartFor;
    if (ci == null) return;
    startTransition(async () => {
      const res = await createPartType(name);
      if (res.ok && res.item) {
        setPartTypes((ts) =>
          ts.some((t) => t.id === res.item!.id) ? ts : [...ts, res.item!]
        );
        addPart(ci, res.item);
        toast.success(`Đã thêm chi tiết "${res.item.name}"`);
      } else toast.error(res.error ?? "Lỗi");
    });
  };

  const submit = () => {
    setError(null);
    const payload: OrderInput = {
      id: initial.id,
      code,
      productName,
      lineId,
      note,
      status: initial.status,
      categories: cats.map((c) => ({
        id: c.id,
        name: c.name,
        sizes: c.sizes.map((s) => ({
          id: s.id,
          sizeLabel: s.sizeLabel,
          targetQty: s.targetQty,
        })),
        parts: c.parts.map((p) => ({
          id: p.id,
          name: p.name,
          color: p.color,
          targets: p.targets,
        })),
      })),
    };
    startTransition(async () => {
      const res = await saveOrder(payload);
      if (res.ok && res.id) {
        toast.success(initial.id ? "Đã cập nhật LSX" : "Đã tạo LSX");
        if (onSaved) onSaved(res.id);
        else router.push(`/lsx/${res.id}`);
      } else {
        setError(res.error ?? "Không lưu được.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  return (
    <div className="space-y-5 pb-8">
      {error && (
        <p className="rounded-lg bg-short-soft px-3 py-2 text-sm text-short">
          {error}
        </p>
      )}

      {/* B1: thông tin chung */}
      <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <SectionTitle n={1} title="Thông tin lệnh" />
        <div className="mt-3 space-y-3">
          <Field label="Mã LSX">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="VD: LSX-001"
              className="tap w-full rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-line"
            />
          </Field>
          <Field label="Tên sản phẩm">
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="VD: Áo thun cổ tròn"
              className="tap w-full rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-line"
            />
          </Field>
          <Field label="Chuyền may phụ trách">
            <div className="flex gap-2">
              <select
                value={lineId ?? ""}
                onChange={(e) =>
                  setLineId(e.target.value ? Number(e.target.value) : null)
                }
                className="tap min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-line"
              >
                <option value="">— Chọn chuyền —</option>
                {lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setAddLineOpen(true)}
                aria-label="Thêm chuyền may"
                className="tap flex items-center justify-center rounded-xl border border-brand-line px-3 text-brand active:bg-brand-soft"
              >
                <Plus size={18} />
              </button>
            </div>
          </Field>
          <Field label="Ghi chú (tuỳ chọn)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 outline-none focus:border-brand-line"
            />
          </Field>
        </div>
      </section>

      {/* B2 + B3: phân loại */}
      {cats.map((cat, ci) => {
        const availSizes = sizeTypes.filter(
          (t) => !cat.sizes.some((s) => s.sizeLabel === t.label)
        );
        const availParts = partTypes.filter(
          (t) => !cat.parts.some((p) => p.name === t.name)
        );
        return (
          <section
            key={ci}
            className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
          >
            <div className="flex items-center gap-2">
              <input
                value={cat.name}
                onChange={(e) => updateCat(ci, { name: e.target.value })}
                placeholder="Phân loại (Áo / Quần)"
                className="tap min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 font-semibold outline-none focus:border-brand-line"
              />
              {cats.length > 1 && (
                <button
                  onClick={() => removeCat(ci)}
                  aria-label="Xoá phân loại"
                  className="tap flex items-center justify-center px-2 text-short"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>

            {/* Sizes */}
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Kích thước & SL thành phẩm
              </p>
              <div className="space-y-2">
                {cat.sizes.map((s, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <span className="nums w-20 shrink-0 rounded-lg border border-line bg-surface-2 py-2 text-center text-sm font-semibold">
                      {s.sizeLabel}
                    </span>
                    <QtyInput
                      value={s.targetQty}
                      onChange={(v) => updateSize(ci, si, { targetQty: v })}
                      ariaLabel={`SL kế hoạch size ${s.sizeLabel}`}
                    />
                    <button
                      onClick={() => removeSize(ci, si)}
                      aria-label="Xoá size"
                      className="tap ml-auto flex w-8 items-center justify-center text-faint"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {availSizes.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => addSize(ci, t.label)}
                    className="nums rounded-full border border-line px-3 py-1 text-sm text-muted active:bg-surface-2"
                  >
                    + {t.label}
                  </button>
                ))}
                <button
                  onClick={() => setNewSizeFor(ci)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-brand-line px-3 py-1 text-sm text-brand active:bg-brand-soft"
                >
                  <Plus size={14} /> Kích thước mới
                </button>
              </div>
            </div>

            {/* Parts */}
            {cat.sizes.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Chi tiết & SL cần gửi theo size
                </p>
                <div className="space-y-3">
                  {cat.parts.map((p, pi) => (
                    <div
                      key={pi}
                      className="rounded-xl border border-line bg-surface-2 p-2.5"
                      style={
                        p.color
                          ? { borderLeft: `3px solid ${p.color}` }
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-2">
                        {p.color && (
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ background: p.color }}
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {p.name}
                        </span>
                        <button
                          onClick={() => removePart(ci, pi)}
                          aria-label="Xoá chi tiết"
                          className="tap flex items-center justify-center px-1 text-short"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="xscroll -mx-0.5 mt-2">
                        <div className="flex gap-2 px-0.5 pb-1">
                          {cat.sizes.map((s, si) => (
                            <div key={si} className="shrink-0 text-center">
                              <div className="nums mb-1 text-xs font-medium text-muted">
                                {s.sizeLabel}
                              </div>
                              <QtyInput
                                value={p.targets[si] ?? 0}
                                onChange={(v) => setPartTarget(ci, pi, si, v)}
                                ariaLabel={`SL ${p.name} size ${s.sizeLabel}`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const t = availParts.find(
                        (x) => x.id === Number(e.target.value)
                      );
                      if (t) addPart(ci, t);
                    }}
                    className="tap min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-brand-line"
                  >
                    <option value="">+ Chọn chi tiết từ danh mục…</option>
                    {availParts.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setNewPartFor(ci)}
                    aria-label="Thêm chi tiết mới"
                    className="tap flex items-center justify-center rounded-xl border border-brand-line px-3 text-brand active:bg-brand-soft"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <button
        onClick={addCat}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line bg-surface py-3 text-sm font-medium text-muted active:bg-surface-2"
      >
        <Layers size={16} /> Thêm phân loại
      </button>

      <div
        className={`z-20 flex gap-2 ${
          embedded
            ? "sticky bottom-0 -mx-4 border-t border-line bg-paper px-4 py-3 sm:-mx-5 sm:px-5"
            : "sticky-above-nav"
        }`}
      >
        <button
          onClick={onCancel ?? (() => router.back())}
          className="tap flex-1 rounded-xl border border-line bg-surface font-medium backdrop-blur"
        >
          Huỷ
        </button>
        <button
          onClick={submit}
          disabled={pending}
          className="tap flex-[2] rounded-xl bg-brand font-semibold text-brand-fg shadow-lg shadow-brand/20 disabled:opacity-60"
        >
          {pending ? "Đang lưu…" : "Lưu LSX"}
        </button>
      </div>

      <PromptDialog
        open={addLineOpen}
        onOpenChange={setAddLineOpen}
        title="Thêm chuyền may"
        placeholder="VD: Anh Lực"
        confirmLabel="Thêm"
        onSubmit={doAddLine}
      />
      <PromptDialog
        open={newSizeFor != null}
        onOpenChange={(v) => !v && setNewSizeFor(null)}
        title="Thêm kích thước mới"
        placeholder="VD: 4XL/17"
        confirmLabel="Thêm"
        onSubmit={doAddSizeType}
      />
      <PromptDialog
        open={newPartFor != null}
        onOpenChange={(v) => !v && setNewPartFor(null)}
        title="Thêm chi tiết mới"
        placeholder="VD: Nẹp cổ"
        confirmLabel="Thêm"
        onSubmit={doAddPartType}
      />
    </div>
  );
}

function SectionTitle({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="nums flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">
        {n}
      </span>
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
