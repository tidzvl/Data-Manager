"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MovementType } from "@prisma/client";
import FormModal, { FormSkeleton } from "@/components/ui/FormModal";
import MovementForm from "@/app/(app)/lsx/[id]/movement/MovementForm";
import { loadMovementForm, type MovementFormData } from "@/app/actions/forms";
import { MOVEMENT_LABELS } from "@/lib/labels";

export type MovementModalTarget = {
  orderId: number;
  /** Có = sửa phiếu; không có = tạo mới với `type`. */
  movementId?: number;
  type?: MovementType;
};

export default function MovementFormModal({
  target,
  onClose,
}: {
  /** null = đóng. Đổi target sẽ nạp lại dữ liệu. */
  target: MovementModalTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<MovementFormData | null>(null);

  const open = target != null;
  const key = target
    ? `${target.orderId}:${target.movementId ?? 0}:${target.type ?? ""}`
    : "";

  useEffect(() => {
    if (!target) return;
    let alive = true;
    setData(null);
    loadMovementForm(target.orderId, target.movementId, target.type)
      .then((d) => alive && setData(d))
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Không nạp được dữ liệu.");
        onClose();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const title = target?.movementId
    ? "Sửa phiếu"
    : target?.type
      ? MOVEMENT_LABELS[target.type]
      : "Tạo phiếu";

  return (
    <FormModal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title={title}
      description={data ? `${data.detail.code} · ${data.detail.productName}` : undefined}
    >
      {data ? (
        <MovementForm
          detail={data.detail}
          initial={data.initial}
          onSaved={() => {
            onClose();
            router.refresh(); // số liệu trên trang đang xem cập nhật ngay
          }}
        />
      ) : (
        <FormSkeleton />
      )}
    </FormModal>
  );
}
