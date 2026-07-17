"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { isPartLevel, MOVEMENT_TYPES } from "@/lib/labels";
import type { MovementType } from "@prisma/client";

export type MovementItemInput = {
  orderSizeId: number;
  partId: number | null;
  quantity: number;
};

export type MovementInput = {
  id?: number;
  orderId: number;
  type: MovementType;
  date: string; // yyyy-mm-dd
  note?: string;
  items: MovementItemInput[];
};

export type MovementResult = { ok: boolean; error?: string; id?: number };

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export async function saveMovement(
  input: MovementInput
): Promise<MovementResult> {
  await requireSession();

  // Gửi may/Gửi thêu đã bị bỏ — form không còn đưa ra, nhưng chặn cả ở đây.
  if (!MOVEMENT_TYPES.includes(input.type)) {
    return { ok: false, error: "Loại phiếu này không còn được dùng." };
  }

  const items = input.items.filter((it) => it.quantity > 0);
  if (items.length === 0) {
    return { ok: false, error: "Nhập số lượng cho ít nhất 1 dòng." };
  }
  if (!input.date) return { ok: false, error: "Chọn ngày." };

  // Chỉ phiếu xuất chi tiết ghi theo chi tiết; đã may / thêu ghi theo size.
  const normalized = items.map((it) => ({
    orderSizeId: it.orderSizeId,
    partId: isPartLevel(input.type) ? it.partId : null,
    quantity: Math.max(0, it.quantity | 0),
  }));

  try {
    const date = parseDate(input.date);
    let movementId: number;

    if (input.id) {
      await prisma.$transaction(async (tx) => {
        await tx.movement.update({
          where: { id: input.id },
          data: {
            type: input.type,
            date,
            note: input.note?.trim() || null,
          },
        });
        await tx.movementItem.deleteMany({ where: { movementId: input.id } });
        await tx.movementItem.createMany({
          data: normalized.map((n) => ({ movementId: input.id!, ...n })),
        });
      });
      movementId = input.id;
    } else {
      const mv = await prisma.movement.create({
        data: {
          orderId: input.orderId,
          type: input.type,
          date,
          note: input.note?.trim() || null,
          items: { create: normalized },
        },
      });
      movementId = mv.id;
    }

    revalidatePath(`/lsx/${input.orderId}`);
    revalidatePath("/journal");
    revalidatePath("/");
    return { ok: true, id: movementId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Lỗi khi lưu phiếu.",
    };
  }
}

export async function deleteMovement(id: number, orderId: number) {
  await requireSession();
  await prisma.movement.delete({ where: { id } });
  revalidatePath(`/lsx/${orderId}`);
  revalidatePath("/journal");
  revalidatePath("/");
}
