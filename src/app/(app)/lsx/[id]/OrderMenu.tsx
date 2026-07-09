"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreVertical, Pencil, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { Menu, MenuItem } from "@/components/ui/Menu";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { setOrderStatus, deleteOrder } from "@/app/actions/orders";

export default function OrderMenu({
  orderId,
  status,
}: {
  orderId: number;
  status: "ACTIVE" | "DONE";
}) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();

  const toggleStatus = () =>
    startTransition(async () => {
      await setOrderStatus(orderId, status === "DONE" ? "ACTIVE" : "DONE");
      toast.success(
        status === "DONE" ? "Đã mở lại lệnh" : "Đã đánh dấu hoàn thành"
      );
    });

  const doDelete = () =>
    startTransition(async () => {
      await deleteOrder(orderId);
    });

  return (
    <>
      <Menu
        trigger={
          <button
            aria-label="Tuỳ chọn"
            disabled={pending}
            className="tap flex items-center justify-center rounded-lg text-muted active:bg-surface-2"
          >
            <MoreVertical size={20} />
          </button>
        }
      >
        <MenuItem
          onSelect={() => router.push(`/lsx/${orderId}/edit`)}
          icon={<Pencil size={16} />}
        >
          Sửa LSX
        </MenuItem>
        <MenuItem
          onSelect={toggleStatus}
          icon={
            status === "DONE" ? (
              <RotateCcw size={16} />
            ) : (
              <CheckCircle2 size={16} />
            )
          }
        >
          {status === "DONE" ? "Mở lại (đang chạy)" : "Đánh dấu hoàn thành"}
        </MenuItem>
        <MenuItem
          onSelect={() => setConfirmOpen(true)}
          icon={<Trash2 size={16} />}
          danger
        >
          Xoá LSX
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Xoá lệnh sản xuất?"
        description="Toàn bộ phân loại, chi tiết và phiếu liên quan sẽ bị xoá. Không thể hoàn tác."
        confirmLabel="Xoá"
        danger
        onConfirm={doDelete}
      />
    </>
  );
}
