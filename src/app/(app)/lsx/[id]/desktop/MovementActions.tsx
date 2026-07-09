"use client";

import { useState } from "react";
import { PackageOpen, Shirt, Send, Undo2 } from "lucide-react";
import type { MovementType } from "@prisma/client";
import { MOVEMENT_TYPES, MOVEMENT_SHORT } from "@/lib/labels";
import MovementFormModal, {
  type MovementModalTarget,
} from "@/components/forms/MovementFormModal";

const ICON: Record<MovementType, typeof PackageOpen> = {
  SEW_OUT: PackageOpen,
  SEW_IN: Shirt,
  EMB_OUT: Send,
  EMB_IN: Undo2,
};
const TONE: Record<MovementType, string> = {
  SEW_OUT: "hover:border-[var(--color-brand-line)] hover:text-brand",
  SEW_IN: "hover:border-[var(--color-ok)] hover:text-ok",
  EMB_OUT: "hover:border-[var(--color-warn)] hover:text-warn",
  EMB_IN: "hover:border-[var(--color-ok)] hover:text-ok",
};

/** 4 nút tạo phiếu, xếp theo đúng thứ tự luồng sản xuất. */
export default function MovementActions({ orderId }: { orderId: number }) {
  const [target, setTarget] = useState<MovementModalTarget | null>(null);

  return (
    <div className="flex items-center gap-1.5">
      {MOVEMENT_TYPES.map((t, i) => {
        const Icon = ICON[t];
        return (
          <button
            key={t}
            onClick={() => setTarget({ orderId, type: t })}
            title={`Tạo phiếu: ${MOVEMENT_SHORT[t]}`}
            className={`flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-muted transition-colors ${TONE[t]}`}
          >
            <span className="nums text-[10px] text-faint">{i + 1}</span>
            <Icon size={15} />
            {MOVEMENT_SHORT[t]}
          </button>
        );
      })}

      <MovementFormModal target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
