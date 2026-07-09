"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Plus,
  PackageOpen,
  Shirt,
  Send,
  Undo2,
  ChevronRight,
} from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import { MOVEMENT_TYPES } from "@/lib/labels";
import type { MovementType } from "@prisma/client";

const META: Record<
  MovementType,
  { title: string; desc: string; Icon: typeof Plus; tone: string }
> = {
  SEW_OUT: {
    title: "Xuất chi tiết → chuyền",
    desc: "Xuất chi tiết (đô sau, tay…) về chuyền may",
    Icon: PackageOpen,
    tone: "text-brand bg-brand-soft",
  },
  SEW_IN: {
    title: "Chuyền gửi hàng đã may",
    desc: "Nhận hàng đã may từ chuyền, theo size",
    Icon: Shirt,
    tone: "text-ok bg-ok-soft",
  },
  EMB_OUT: {
    title: "Gửi hàng đã may đi thêu",
    desc: "Chỉ gửi được phần đã may xong",
    Icon: Send,
    tone: "text-warn bg-warn-soft",
  },
  EMB_IN: {
    title: "Nhận hàng thêu về",
    desc: "Nhận lại hàng đang ở xưởng thêu",
    Icon: Undo2,
    tone: "text-ok bg-ok-soft",
  },
};

export default function CreateMovementFab({ orderId }: { orderId: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const pick = (type: MovementType) => {
    setOpen(false);
    router.push(`/lsx/${orderId}/movement/new?type=${type}`);
  };

  return (
    <>
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 500, damping: 30 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(true)}
        className="above-nav fixed right-4 z-40 flex h-14 items-center lg:hidden gap-2 rounded-full bg-brand pl-4 pr-5 font-semibold text-brand-fg shadow-lg shadow-brand/25"
      >
        <Plus size={22} strokeWidth={2.6} /> Phiếu
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen} title="Tạo phiếu mới">
        <div className="space-y-2">
          {MOVEMENT_TYPES.map((t, i) => {
            const m = META[t];
            return (
              <motion.button
                key={t}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => pick(t)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-3 text-left active:border-brand-line"
              >
                <span
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${m.tone}`}
                >
                  <m.Icon size={20} />
                  <span className="nums absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-[9px] font-bold text-muted">
                    {i + 1}
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{m.title}</div>
                  <div className="truncate text-xs text-muted">{m.desc}</div>
                </div>
                <ChevronRight size={18} className="text-faint" />
              </motion.button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
