"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Factory } from "lucide-react";
import PromptDialog from "@/components/ui/PromptDialog";
import OrderFormModal from "@/components/forms/OrderFormModal";
import { createLine } from "@/app/actions/lines";

export default function DesktopActions() {
  const router = useRouter();
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const doAddLine = (name: string) =>
    startTransition(async () => {
      const res = await createLine(name);
      if (res.ok) {
        toast.success(`Đã thêm chuyền "${name}"`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setAddLineOpen(true)}
        disabled={pending}
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm font-medium text-muted transition-colors hover:border-[var(--color-brand-line)] hover:text-ink disabled:opacity-60"
      >
        <Factory size={16} /> Thêm chuyền
      </button>

      <button
        onClick={() => setNewOrderOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg shadow-lg shadow-brand/20 transition-transform active:scale-95"
      >
        <Plus size={18} strokeWidth={2.6} /> Tạo LSX
      </button>

      <PromptDialog
        open={addLineOpen}
        onOpenChange={setAddLineOpen}
        title="Thêm chuyền may"
        placeholder="VD: Anh Lực"
        confirmLabel="Thêm"
        onSubmit={doAddLine}
      />
      <OrderFormModal open={newOrderOpen} onOpenChange={setNewOrderOpen} />
    </div>
  );
}
