"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getOrderDetail, type OrderDetail } from "@/lib/aggregate";
import { listSizeTypes, listPartTypes } from "./types";
import type { SizeTypeDto, PartTypeDto } from "./types";
import type { MovementType } from "@prisma/client";
import type { OrderFormInitial } from "@/app/(app)/lsx/OrderForm";
import type { MovementFormInitial } from "@/app/(app)/lsx/[id]/movement/MovementForm";

export type OrderFormData = {
  lines: { id: number; name: string }[];
  sizeTypes: SizeTypeDto[];
  partTypes: PartTypeDto[];
  initial: OrderFormInitial;
};

/** Nạp dữ liệu cho form LSX. Không truyền orderId = tạo mới. */
export async function loadOrderForm(orderId?: number): Promise<OrderFormData> {
  await requireSession();

  const [lines, sizeTypes, partTypes, detail] = await Promise.all([
    prisma.sewingLine.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listSizeTypes(),
    listPartTypes(),
    orderId ? getOrderDetail(orderId) : Promise.resolve(null),
  ]);

  const initial: OrderFormInitial = detail
    ? {
        id: detail.id,
        code: detail.code,
        productName: detail.productName,
        lineId: detail.lineId,
        note: detail.note ?? "",
        status: detail.status,
        categories: detail.categories.map((c) => ({
          id: c.id,
          name: c.name,
          sizes: c.sizes.map((s) => ({
            id: s.id,
            sizeLabel: s.sizeLabel,
            targetQty: s.targetQty,
          })),
          parts: c.parts.map((p) => ({
            id: p.id,
            name: p.name,
            color: p.color,
            targets: c.sizes.map((s) => p.targets[s.id] ?? 0),
          })),
        })),
      }
    : {
        code: "",
        productName: "",
        lineId: null,
        note: "",
        status: "ACTIVE",
        categories: [],
      };

  return { lines, sizeTypes, partTypes, initial };
}

export type MovementFormData = {
  detail: OrderDetail;
  initial: MovementFormInitial;
};

/**
 * Nạp dữ liệu cho form phiếu.
 * Có movementId = sửa; không có = tạo mới với loại `type`.
 */
export async function loadMovementForm(
  orderId: number,
  movementId?: number,
  type: MovementType = "SEW_IN"
): Promise<MovementFormData> {
  await requireSession();

  const [detail, movement] = await Promise.all([
    getOrderDetail(orderId),
    movementId
      ? prisma.movement.findUnique({
          where: { id: movementId },
          include: { items: true },
        })
      : Promise.resolve(null),
  ]);

  if (!detail) throw new Error("Không tìm thấy lệnh sản xuất.");
  if (movementId && (!movement || movement.orderId !== orderId)) {
    throw new Error("Không tìm thấy phiếu.");
  }
  // Form này dựng quanh 4 công đoạn của luồng (trần SL còn lại, nhập theo chi
  // tiết hay theo size…). Đợt của mục tự do không có công đoạn nào để bám vào.
  if (movement && !movement.type) {
    throw new Error("Đợt của mục tự do chỉ sửa được trên bảng.");
  }

  const initial: MovementFormInitial = movement
    ? {
        id: movement.id,
        type: movement.type!,
        date: movement.date.toISOString().slice(0, 10),
        note: movement.note ?? "",
        qty: Object.fromEntries(
          movement.items.map((it) => [
            `${it.partId ?? 0}:${it.orderSizeId}`,
            it.quantity,
          ])
        ),
      }
    : { type, date: "", note: "", qty: {} };

  return { detail, initial };
}
