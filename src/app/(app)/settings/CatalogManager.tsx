"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import PromptDialog from "@/components/ui/PromptDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  createSizeType,
  createPartType,
  deleteSizeType,
  deletePartType,
  type SizeTypeDto,
  type PartTypeDto,
} from "@/app/actions/types";

type Del = { kind: "size" | "part"; id: number; label: string } | null;

export default function CatalogManager({
  sizeTypes,
  partTypes,
}: {
  sizeTypes: SizeTypeDto[];
  partTypes: PartTypeDto[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [addSize, setAddSize] = useState(false);
  const [addPart, setAddPart] = useState(false);
  const [del, setDel] = useState<Del>(null);

  const doAddSize = (label: string) =>
    startTransition(async () => {
      const res = await createSizeType(label);
      if (res.ok) {
        toast.success("Đã thêm kích thước");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });

  const doAddPart = (name: string) =>
    startTransition(async () => {
      const res = await createPartType(name);
      if (res.ok) {
        toast.success("Đã thêm chi tiết");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });

  const doDelete = () => {
    if (!del) return;
    const { kind, id } = del;
    startTransition(async () => {
      if (kind === "size") await deleteSizeType(id);
      else await deletePartType(id);
      toast.success("Đã xoá khỏi danh mục");
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Kích thước</h3>
          <button
            onClick={() => setAddSize(true)}
            className="flex items-center gap-1 rounded-lg border border-brand-line px-2 py-1 text-xs font-medium text-brand active:bg-brand-soft"
          >
            <Plus size={13} /> Thêm
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sizeTypes.map((s) => (
            <span
              key={s.id}
              className="nums flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pl-2.5 pr-1 text-sm"
            >
              {s.label}
              <button
                onClick={() =>
                  setDel({ kind: "size", id: s.id, label: s.label })
                }
                aria-label={`Xoá ${s.label}`}
                className="flex h-6 w-6 items-center justify-center rounded text-faint active:text-short"
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {sizeTypes.length === 0 && (
            <p className="text-sm text-muted">Chưa có kích thước nào.</p>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Chi tiết</h3>
          <button
            onClick={() => setAddPart(true)}
            className="flex items-center gap-1 rounded-lg border border-brand-line px-2 py-1 text-xs font-medium text-brand active:bg-brand-soft"
          >
            <Plus size={13} /> Thêm
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {partTypes.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pl-2 pr-1 text-sm"
              style={{ borderLeft: `3px solid ${p.color}` }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: p.color }}
              />
              {p.name}
              <button
                onClick={() => setDel({ kind: "part", id: p.id, label: p.name })}
                aria-label={`Xoá ${p.name}`}
                className="flex h-6 w-6 items-center justify-center rounded text-faint active:text-short"
              >
                <Trash2 size={12} />
              </button>
            </span>
          ))}
          {partTypes.length === 0 && (
            <p className="text-sm text-muted">Chưa có chi tiết nào.</p>
          )}
        </div>
      </div>

      <PromptDialog
        open={addSize}
        onOpenChange={setAddSize}
        title="Thêm kích thước"
        placeholder="VD: 4XL/17"
        confirmLabel="Thêm"
        onSubmit={doAddSize}
      />
      <PromptDialog
        open={addPart}
        onOpenChange={setAddPart}
        title="Thêm chi tiết"
        placeholder="VD: Nẹp cổ"
        confirmLabel="Thêm"
        onSubmit={doAddPart}
      />
      <ConfirmDialog
        open={del != null}
        onOpenChange={(v) => !v && setDel(null)}
        title={`Xoá "${del?.label ?? ""}" khỏi danh mục?`}
        description="Các LSX đã tạo không bị ảnh hưởng, chỉ ẩn khỏi danh sách chọn nhanh."
        confirmLabel="Xoá"
        danger
        onConfirm={doDelete}
      />
    </div>
  );
}
