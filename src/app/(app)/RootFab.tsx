"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Plus, ClipboardPlus, Factory, ChevronRight } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import PromptDialog from "@/components/ui/PromptDialog";
import { createLine } from "@/app/actions/lines";

export default function RootFab() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [, startTransition] = useTransition();

  const doAddLine = (name: string) =>
    startTransition(async () => {
      const res = await createLine(name);
      if (res.ok) {
        toast.success(`Đã thêm chuyền "${name}"`);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });

  return (
    <>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 500, damping: 30 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(true)}
        aria-label="Thêm mới"
        className="above-nav fixed right-4 z-40 flex h-14 w-14 lg:hidden items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg shadow-brand/25"
      >
        <Plus size={26} strokeWidth={2.6} />
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen} title="Thêm mới">
        <div className="space-y-2">
          <button
            onClick={() => {
              setOpen(false);
              router.push("/lsx/new");
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-3 text-left active:border-brand-line"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <ClipboardPlus size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Lệnh sản xuất</div>
              <div className="truncate text-xs text-muted">
                Tạo LSX mới với phân loại, size và chi tiết
              </div>
            </div>
            <ChevronRight size={18} className="text-faint" />
          </button>

          <button
            onClick={() => {
              setOpen(false);
              setAddLineOpen(true);
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-3 text-left active:border-brand-line"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
              <Factory size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">Chuyền may</div>
              <div className="truncate text-xs text-muted">
                Thêm chuyền để gán cho các LSX
              </div>
            </div>
            <ChevronRight size={18} className="text-faint" />
          </button>
        </div>
      </Sheet>

      <PromptDialog
        open={addLineOpen}
        onOpenChange={setAddLineOpen}
        title="Thêm chuyền may"
        placeholder="VD: Anh Lực"
        confirmLabel="Thêm"
        onSubmit={doAddLine}
      />
    </>
  );
}
