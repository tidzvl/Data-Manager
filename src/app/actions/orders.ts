"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type SizeInput = {
  id?: number;
  sizeLabel: string;
  targetQty: number;
};
export type PartInput = {
  id?: number;
  name: string;
  color: string | null;
  /** targetQty theo index của size trong cùng phân loại */
  targets: number[];
};
export type CategoryInput = {
  id?: number;
  name: string;
  sizes: SizeInput[];
  parts: PartInput[];
};
export type OrderInput = {
  id?: number;
  code: string;
  productName: string;
  /** Mỗi LSX do đúng 1 chuyền may phụ trách */
  lineId: number | null;
  note?: string;
  status?: "ACTIVE" | "DONE";
  categories: CategoryInput[];
};

export type SaveResult = { ok: boolean; error?: string; id?: number };

function validate(input: OrderInput): string | null {
  if (!input.code.trim()) return "Nhập mã LSX.";
  if (!input.productName.trim()) return "Nhập tên sản phẩm.";
  if (input.lineId == null) return "Chọn chuyền may phụ trách.";
  if (input.categories.length === 0) return "Thêm ít nhất 1 phân loại.";
  for (const c of input.categories) {
    if (!c.name.trim()) return "Phân loại chưa có tên.";
    if (c.sizes.length === 0)
      return `Phân loại "${c.name}" chưa có kích thước nào.`;
    for (const s of c.sizes)
      if (!s.sizeLabel.trim())
        return `Phân loại "${c.name}" có kích thước chưa đặt tên.`;
    for (const p of c.parts)
      if (!p.name.trim())
        return `Phân loại "${c.name}" có chi tiết chưa đặt tên.`;
  }
  return null;
}

export async function saveOrder(input: OrderInput): Promise<SaveResult> {
  await requireSession();
  const err = validate(input);
  if (err) return { ok: false, error: err };

  try {
    const savedId = await prisma.$transaction(async (tx) => {
      const dupe = await tx.productionOrder.findUnique({
        where: { code: input.code.trim() },
      });
      if (dupe && dupe.id !== input.id) {
        throw new Error(`Mã LSX "${input.code.trim()}" đã tồn tại.`);
      }

      let orderId: number;
      if (input.id) {
        await tx.productionOrder.update({
          where: { id: input.id },
          data: {
            code: input.code.trim(),
            productName: input.productName.trim(),
            lineId: input.lineId,
            note: input.note?.trim() || null,
            status: input.status ?? "ACTIVE",
          },
        });
        orderId = input.id;
      } else {
        const created = await tx.productionOrder.create({
          data: {
            code: input.code.trim(),
            productName: input.productName.trim(),
            lineId: input.lineId,
            note: input.note?.trim() || null,
          },
        });
        orderId = created.id;
      }

      // Xoá category không còn trong payload (cascade xuống size/part)
      const keepCatIds = input.categories
        .map((c) => c.id)
        .filter((x): x is number => !!x);
      await tx.category.deleteMany({
        where: { orderId, id: { notIn: keepCatIds.length ? keepCatIds : [0] } },
      });

      let cpos = 0;
      for (const c of input.categories) {
        let categoryId: number;
        if (c.id) {
          await tx.category.update({
            where: { id: c.id },
            data: { name: c.name.trim(), position: cpos },
          });
          categoryId = c.id;
        } else {
          const created = await tx.category.create({
            data: { orderId, name: c.name.trim(), position: cpos },
          });
          categoryId = created.id;
        }
        cpos++;

        // Sizes
        const keepSizeIds = c.sizes
          .map((s) => s.id)
          .filter((x): x is number => !!x);
        await tx.orderSize.deleteMany({
          where: {
            categoryId,
            id: { notIn: keepSizeIds.length ? keepSizeIds : [0] },
          },
        });

        const sizeIds: number[] = [];
        let spos = 0;
        for (const s of c.sizes) {
          const data = {
            sizeLabel: s.sizeLabel.trim(),
            targetQty: Math.max(0, s.targetQty | 0),
            position: spos,
          };
          if (s.id) {
            await tx.orderSize.update({ where: { id: s.id }, data });
            sizeIds.push(s.id);
          } else {
            const created = await tx.orderSize.create({
              data: { categoryId, ...data },
            });
            sizeIds.push(created.id);
          }
          spos++;
        }

        // Parts + targets
        const keepPartIds = c.parts
          .map((p) => p.id)
          .filter((x): x is number => !!x);
        await tx.part.deleteMany({
          where: {
            categoryId,
            id: { notIn: keepPartIds.length ? keepPartIds : [0] },
          },
        });

        let ppos = 0;
        for (const p of c.parts) {
          let partId: number;
          if (p.id) {
            await tx.part.update({
              where: { id: p.id },
              data: { name: p.name.trim(), color: p.color, position: ppos },
            });
            partId = p.id;
          } else {
            const created = await tx.part.create({
              data: {
                categoryId,
                name: p.name.trim(),
                color: p.color,
                position: ppos,
              },
            });
            partId = created.id;
          }
          ppos++;

          for (let i = 0; i < sizeIds.length; i++) {
            const qty = Math.max(0, (p.targets[i] ?? 0) | 0);
            const orderSizeId = sizeIds[i];
            await tx.partTarget.upsert({
              where: { partId_orderSizeId: { partId, orderSizeId } },
              update: { targetQty: qty },
              create: { partId, orderSizeId, targetQty: qty },
            });
          }
        }
      }

      return orderId;
    });

    revalidatePath("/");
    revalidatePath(`/lsx/${savedId}`);
    return { ok: true, id: savedId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Lỗi khi lưu LSX.",
    };
  }
}

export async function deleteOrder(id: number) {
  await requireSession();
  await prisma.productionOrder.delete({ where: { id } });
  revalidatePath("/");
  redirect("/");
}

export async function setOrderStatus(id: number, status: "ACTIVE" | "DONE") {
  await requireSession();
  await prisma.productionOrder.update({ where: { id }, data: { status } });
  revalidatePath("/");
  revalidatePath(`/lsx/${id}`);
}
