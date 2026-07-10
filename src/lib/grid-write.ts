import "server-only";
import { prisma } from "./db";
import type { MovementType } from "@prisma/client";

/**
 * Ghi dữ liệu cho bảng kính — thuần DB, không đụng session/cache.
 * `app/actions/grid.ts` bọc thêm requireSession + revalidatePath.
 */

function clean(qty: number): number {
  return Math.max(0, Math.trunc(qty) || 0);
}

export function parseDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
}

/** Định mức 1 ô (chi tiết × size). PartTarget có unique key nên upsert thẳng. */
export async function setPartTargetDb(
  partId: number,
  orderSizeId: number,
  qty: number
) {
  await prisma.partTarget.upsert({
    where: { partId_orderSizeId: { partId, orderSizeId } },
    update: { targetQty: clean(qty) },
    create: { partId, orderSizeId, targetQty: clean(qty) },
  });
}

/**
 * Sửa SL kế hoạch của một ô trên dòng cha (công đoạn × size).
 * Chỉ áp cho các mục khác "Gửi may" — target của Gửi may là tổng định mức các
 * chi tiết nên phải sửa ở dòng con.
 */
export async function setStageTargetDb(
  stageId: number,
  orderSizeId: number,
  qty: number
): Promise<string | null> {
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) return "Không tìm thấy công đoạn.";
  if (stage.type === "SEW_OUT")
    return 'Target của "Gửi may" là tổng định mức các chi tiết — sửa ở dòng chi tiết.';

  await prisma.stageTarget.upsert({
    where: { stageId_orderSizeId: { stageId, orderSizeId } },
    update: { targetQty: clean(qty) },
    create: { stageId, orderSizeId, targetQty: clean(qty) },
  });
  return null;
}

/** Thêm một công đoạn cho phân loại. Trùng thì báo lỗi (unique categoryId+type). */
export async function addStageDb(
  categoryId: number,
  type: MovementType
): Promise<string | null> {
  const existing = await prisma.stage.findUnique({
    where: { categoryId_type: { categoryId, type } },
  });
  if (existing) return "Mục này đã có rồi.";
  await prisma.stage.create({ data: { categoryId, type } });
  return null;
}


/**
 * Số lượng 1 ô trong một đợt đã có.
 * Không `upsert` được: MovementItem không có unique key trên
 * (movementId, orderSizeId, partId), và MySQL coi mỗi NULL là một giá trị khác
 * nhau nên unique index cũng không chặn được partId null trùng nhau.
 * Vì vậy tìm-rồi-ghi trong transaction.
 */
export async function setItemQtyDb(
  movementId: number,
  orderSizeId: number,
  partId: number | null,
  qty: number
) {
  const quantity = clean(qty);
  await prisma.$transaction(async (tx) => {
    const existing = await tx.movementItem.findFirst({
      where: { movementId, orderSizeId, partId },
    });

    if (!existing) {
      if (quantity > 0)
        await tx.movementItem.create({
          data: { movementId, orderSizeId, partId, quantity },
        });
      return;
    }

    // Xoá hẳn dòng 0 để phiếu không phình ra toàn số 0.
    if (quantity === 0)
      await tx.movementItem.delete({ where: { id: existing.id } });
    else
      await tx.movementItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
  });
}

export type NewBatchInput = {
  orderId: number;
  type: MovementType;
  /** yyyy-mm-dd */
  date: string;
  note?: string;
  /** Chỉ phiếu SEW_OUT mới gắn chi tiết. */
  partId: number | null;
  quantities: { orderSizeId: number; qty: number }[];
};

/** Thêm một đợt gửi/nhận mới. Trả về lỗi dạng chuỗi nếu dữ liệu không hợp lệ. */
export async function addBatchDb(input: NewBatchInput): Promise<string | null> {
  const date = parseDate(input.date);
  if (!date) return "Chọn ngày cho đợt này.";

  const items = input.quantities
    .map((q) => ({ orderSizeId: q.orderSizeId, quantity: clean(q.qty) }))
    .filter((q) => q.quantity > 0);
  if (items.length === 0) return "Nhập số lượng cho ít nhất 1 size.";

  const partId = input.type === "SEW_OUT" ? input.partId : null;

  await prisma.movement.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      date,
      note: input.note?.trim() || null,
      items: { create: items.map((i) => ({ ...i, partId })) },
    },
  });
  return null;
}

export type NewPartInput = {
  categoryId: number;
  name: string;
  targets: { orderSizeId: number; qty: number }[];
};

/** Thêm một chi tiết (bán thành phẩm) mới kèm định mức. */
export async function addPartDb(input: NewPartInput): Promise<string | null> {
  const name = input.name.trim();
  if (!name) return "Nhập tên chi tiết.";

  // Lấy màu từ danh mục dùng chung nếu tên đã có sẵn ở đó.
  const known = await prisma.partType.findUnique({ where: { name } });
  const max = await prisma.part.aggregate({
    where: { categoryId: input.categoryId },
    _max: { position: true },
  });

  const targets = input.targets
    .map((t) => ({ orderSizeId: t.orderSizeId, targetQty: clean(t.qty) }))
    .filter((t) => t.targetQty > 0);

  await prisma.part.create({
    data: {
      categoryId: input.categoryId,
      name,
      color: known?.color ?? null,
      position: (max._max.position ?? -1) + 1,
      targets: { create: targets },
    },
  });
  return null;
}

export async function deleteBatchDb(movementId: number) {
  await prisma.movement.delete({ where: { id: movementId } });
}

/**
 * Sửa ngày tạo LSX.
 * `createdAt` chỉ có `@default(now())`, không phải `@updatedAt`, nên ghi đè
 * được. Giờ bị đặt về 00:00 UTC — trước nay chỉ có phần ngày là được dùng.
 */
export async function setOrderCreatedAtDb(
  orderId: number,
  iso: string
): Promise<string | null> {
  const date = parseDate(iso);
  if (!date) return "Ngày không hợp lệ.";
  await prisma.productionOrder.update({
    where: { id: orderId },
    data: { createdAt: date },
  });
  return null;
}

/** Một dòng trên bảng: `stageId > 0` là một mục; `stageId = 0` là phân loại rỗng. */
export type DeleteTarget = { stageId: number; categoryId: number };

export type DeleteSummary = {
  stages: number;
  categories: number;
  orders: number;
};

/**
 * Xoá theo đúng dòng người dùng chọn.
 *
 * - Dòng mục → xoá `Stage` đó cùng dữ liệu của nó. Các mục khác của cùng LSX,
 *   và cả LSX, đều giữ nguyên.
 * - Dòng giữ chỗ (phân loại chưa có mục nào) → xoá `Category`; nếu đó là phân
 *   loại cuối cùng thì xoá luôn `ProductionOrder`.
 *
 * Không tự dọn phân loại khi mục cuối của nó bị xoá: người dùng thường xoá một
 * mục để nhập lại, và dòng giữ chỗ chính là chỗ bấm "Thêm mục".
 */
export async function deleteRowsDb(
  targets: DeleteTarget[]
): Promise<DeleteSummary> {
  const summary: DeleteSummary = { stages: 0, categories: 0, orders: 0 };
  if (targets.length === 0) return summary;

  for (const t of targets.filter((x) => x.stageId > 0)) {
    if (await deleteStageDb(t.stageId)) summary.stages++;
  }

  const categoryIds = targets.filter((x) => x.stageId === 0).map((x) => x.categoryId);
  if (categoryIds.length > 0) {
    const res = await deleteCategoriesDb(categoryIds);
    summary.categories = res.categories;
    summary.orders = res.orders;
  }
  return summary;
}

/**
 * Xoá một mục cùng dữ liệu của nó.
 *
 * "Gửi may" sở hữu các chi tiết của phân loại (cascade cả định mức lẫn những
 * đợt đã gửi của chúng). Các mục khác sở hữu các đợt gửi/nhận cùng loại.
 *
 * Cố ý KHÔNG xoá thẳng `Movement`: một phiếu có thể chứa item của cả Áo lẫn
 * Quần, xoá cả phiếu là nuốt luôn phân loại kia. Xoá item trước, rồi mới dọn
 * những phiếu không còn item nào.
 */
export async function deleteStageDb(stageId: number): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const stage = await tx.stage.findUnique({
      where: { id: stageId },
      include: { category: { select: { id: true, orderId: true } } },
    });
    if (!stage) return false;

    const sizes = await tx.orderSize.findMany({
      where: { categoryId: stage.category.id },
      select: { id: true },
    });
    const sizeIds = sizes.map((s) => s.id);

    if (stage.type === "SEW_OUT") {
      await tx.part.deleteMany({ where: { categoryId: stage.category.id } });
    }

    if (sizeIds.length > 0) {
      await tx.movementItem.deleteMany({
        where: {
          orderSizeId: { in: sizeIds },
          movement: { orderId: stage.category.orderId, type: stage.type },
        },
      });
    }
    await tx.movement.deleteMany({
      where: {
        orderId: stage.category.orderId,
        type: stage.type,
        items: { none: {} },
      },
    });

    // Cascade sẽ dọn StageTarget.
    await tx.stage.delete({ where: { id: stageId } });
    return true;
  });
}

/** Xoá phân loại; LSX nào không còn phân loại nào thì xoá luôn. */
export async function deleteCategoriesDb(
  categoryIds: number[]
): Promise<{ categories: number; orders: number }> {
  if (categoryIds.length === 0) return { categories: 0, orders: 0 };

  const cats = await prisma.category.findMany({
    where: { id: { in: categoryIds } },
    select: { orderId: true },
  });
  const orderIds = [...new Set(cats.map((c) => c.orderId))];

  const removed = await prisma.category.deleteMany({
    where: { id: { in: categoryIds } },
  });

  // OrderSize cascade kéo theo MovementItem, để lại phiếu rỗng.
  await prisma.movement.deleteMany({
    where: { orderId: { in: orderIds }, items: { none: {} } },
  });

  const orders = await prisma.productionOrder.deleteMany({
    where: { id: { in: orderIds }, categories: { none: {} } },
  });

  return { categories: removed.count, orders: orders.count };
}

/** Sửa ngày của một đợt gửi/nhận. */
export async function setMovementDateDb(
  movementId: number,
  iso: string
): Promise<string | null> {
  const date = parseDate(iso);
  if (!date) return "Ngày không hợp lệ.";
  await prisma.movement.update({
    where: { id: movementId },
    data: { date },
  });
  return null;
}
