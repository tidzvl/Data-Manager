"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import FormModal, { FormSkeleton } from "@/components/ui/FormModal";
import OrderForm from "@/app/(app)/lsx/OrderForm";
import { loadOrderForm, type OrderFormData } from "@/app/actions/forms";

export default function OrderFormModal({
  open,
  onOpenChange,
  orderId,
  /** Sau khi tạo mới, điều hướng sang LSX vừa tạo thay vì chỉ refresh. */
  gotoAfterCreate,
  /** Tông kính, khi mở từ bảng LSX trên desktop. */
  glass,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Có = sửa LSX; không có = tạo mới. */
  orderId?: number;
  gotoAfterCreate?: boolean;
  glass?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<OrderFormData | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    loadOrderForm(orderId)
      .then((d) => alive && setData(d))
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Không nạp được dữ liệu.");
        onOpenChange(false);
      });
    return () => {
      alive = false;
    };
  }, [open, orderId, onOpenChange]);

  const handleSaved = (id: number) => {
    onOpenChange(false);
    if (!orderId && gotoAfterCreate) router.push(`/lsx/${id}`);
    else router.refresh(); // cập nhật ngay trang đang xem
  };

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      glass={glass}
      title={orderId ? "Sửa lệnh sản xuất" : "Tạo lệnh sản xuất"}
      description={
        orderId
          ? undefined
          : "Khai báo phân loại, kích thước và chi tiết cần xuất"
      }
    >
      {data ? (
        <OrderForm
          initial={data.initial}
          lines={data.lines}
          sizeTypes={data.sizeTypes}
          partTypes={data.partTypes}
          onSaved={handleSaved}
          onCancel={() => onOpenChange(false)}
        />
      ) : (
        <FormSkeleton />
      )}
    </FormModal>
  );
}
