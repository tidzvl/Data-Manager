"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Factory } from "lucide-react";
import PromptDialog from "@/components/ui/PromptDialog";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { createLine, deleteLine, renameLine } from "@/app/actions/lines";

type Line = { id: number; name: string; used: number };

export default function LinesManager({ lines }: { lines: Line[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<Line | null>(null);
  const [deleting, setDeleting] = useState<Line | null>(null);

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createLine(name);
      if (res.ok) {
        setNewName("");
        toast.success("Đã thêm chuyền");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  };

  const doRename = (name: string) => {
    if (!renaming) return;
    const id = renaming.id;
    startTransition(async () => {
      await renameLine(id, name);
      toast.success("Đã đổi tên");
      router.refresh();
    });
  };

  const doDelete = () => {
    if (!deleting) return;
    const id = deleting.id;
    startTransition(async () => {
      const res = await deleteLine(id);
      if (!res.ok) toast.error(res.error ?? "Lỗi");
      else {
        toast.success("Đã xoá chuyền");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {lines.map((l) => (
          <li
            key={l.id}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2"
          >
            <Factory size={16} className="shrink-0 text-faint" />
            <span className="flex-1 font-medium">{l.name}</span>
            {l.used > 0 && (
              <span className="nums rounded-md bg-surface px-1.5 py-0.5 text-xs text-faint">
                dùng {l.used}
              </span>
            )}
            <button
              onClick={() => setRenaming(l)}
              aria-label="Đổi tên"
              className="tap flex items-center justify-center text-brand"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => setDeleting(l)}
              disabled={pending || l.used > 0}
              aria-label="Xoá"
              className="tap flex items-center justify-center text-short disabled:opacity-25"
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
        {lines.length === 0 && (
          <li className="text-sm text-muted">Chưa có chuyền may nào.</li>
        )}
      </ul>

      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Tên chuyền mới"
          className="tap min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-line"
        />
        <button
          onClick={add}
          disabled={pending}
          className="tap flex items-center gap-1 rounded-xl bg-brand px-4 font-semibold text-brand-fg disabled:opacity-60"
        >
          <Plus size={18} /> Thêm
        </button>
      </div>

      <PromptDialog
        open={renaming != null}
        onOpenChange={(v) => !v && setRenaming(null)}
        title="Đổi tên chuyền may"
        placeholder="Tên chuyền"
        defaultValue={renaming?.name ?? ""}
        onSubmit={doRename}
      />
      <ConfirmDialog
        open={deleting != null}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Xoá chuyền may?"
        description={`Xoá chuyền "${deleting?.name ?? ""}".`}
        confirmLabel="Xoá"
        danger
        onConfirm={doDelete}
      />
    </div>
  );
}
