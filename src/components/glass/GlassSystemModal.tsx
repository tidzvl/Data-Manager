"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import FormModal from "@/components/ui/FormModal";
import LinesManager from "@/app/(app)/settings/LinesManager";
import CatalogManager from "@/app/(app)/settings/CatalogManager";
import ChangePassword from "@/app/(app)/settings/ChangePassword";
import { listLinesWithUsage } from "@/app/actions/lines";
import {
  listPartTypes,
  listSizeTypes,
  type PartTypeDto,
  type SizeTypeDto,
} from "@/app/actions/types";

type Data = {
  lines: { id: number; name: string; used: number }[];
  sizeTypes: SizeTypeDto[];
  partTypes: PartTypeDto[];
};

/**
 * Toàn bộ trang Cài đặt cũ, gom vào một modal mở từ nút bánh răng — desktop
 * không còn điều hướng sang route riêng nữa.
 */
export default function GlassSystemModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    Promise.all([listLinesWithUsage(), listSizeTypes(), listPartTypes()])
      .then(([lines, sizeTypes, partTypes]) => {
        if (alive) setData({ lines, sizeTypes, partTypes });
      })
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : "Không nạp được dữ liệu.");
        onOpenChange(false);
      });
    return () => {
      alive = false;
    };
  }, [open, onOpenChange]);

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      glass
      title="Cài đặt"
      description="Chuyền may, danh mục dùng chung và mật khẩu."
    >
      {!data ? (
        <p className="py-10 text-center text-sm text-muted">Đang tải…</p>
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-3 font-semibold">Chuyền may</h3>
            <LinesManager lines={data.lines} />
          </section>

          <section>
            <h3 className="mb-1 font-semibold">Danh mục dùng chung</h3>
            <p className="mb-3 text-xs text-muted">
              Kích thước ở đây chính là các cột size của bảng.
            </p>
            <CatalogManager
              sizeTypes={data.sizeTypes}
              partTypes={data.partTypes}
            />
          </section>

          <section>
            <h3 className="mb-3 font-semibold">Đổi mật khẩu</h3>
            <ChangePassword />
          </section>
        </div>
      )}
    </FormModal>
  );
}
