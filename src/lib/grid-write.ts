import "server-only";
import { prisma } from "./db";
import { MUC_TYPES } from "./grid-types";
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

/**
 * SL kế hoạch của một công đoạn, theo từng size.
 *
 * "Gửi may" không có `StageTarget` của riêng nó — target của nó là tổng định mức
 * các chi tiết, nên phải cộng `PartTarget` lại. Ba mục kia đọc thẳng bảng của
 * mình. Cùng một phép suy với `targetFor` bên `grid.ts`.
 */
async function stageTargets(stageId: number): Promise<Map<number, number>> {
  const stage = await prisma.stage.findUnique({
    where: { id: stageId },
    include: { targets: true },
  });
  if (!stage) return new Map();

  if (stage.type !== "SEW_OUT")
    return new Map(stage.targets.map((t) => [t.orderSizeId, t.targetQty]));

  const parts = await prisma.partTarget.findMany({
    where: { part: { categoryId: stage.categoryId } },
  });
  const out = new Map<number, number>();
  for (const t of parts)
    out.set(t.orderSizeId, (out.get(t.orderSizeId) ?? 0) + t.targetQty);
  return out;
}

/**
 * Thêm một công đoạn cho phân loại. Trùng thì báo lỗi (unique categoryId+type).
 *
 * `sourceStageId` là mục người dùng đang đứng lúc bấm "+": chép SL kế hoạch của
 * nó sang mục mới, vì bốn mục của cùng một phân loại chạy nối tiếp nhau trên
 * cùng lô hàng — gửi bao nhiêu thì nhận bấy nhiêu. Chép chứ không liên kết:
 * người dùng sửa lại được từng ô, và mục cũ đổi sau đó thì mục mới không đổi theo.
 *
 * Không chép khi mục MỚI là "Gửi may": target của nó suy từ định mức các chi
 * tiết (dùng chung cả phân loại) nên tự có sẵn, mà `StageTarget` của nó cũng bị
 * tầng DB chặn ghi.
 */
export async function addStageDb(
  categoryId: number,
  type: MovementType,
  sourceStageId?: number
): Promise<string | null> {
  // Gửi may/Gửi thêu đã bị bỏ — menu không còn đưa ra, nhưng chặn cả ở đây.
  if (!MUC_TYPES.includes(type)) return "Mục này không còn được dùng.";

  const existing = await prisma.stage.findFirst({ where: { categoryId, type } });
  if (existing) return "Mục này đã có rồi.";

  // Chỉ nhận nguồn nằm trong cùng phân loại — id lạ thì bỏ qua, không chép bừa.
  let targets = new Map<number, number>();
  if (sourceStageId != null && type !== "SEW_OUT") {
    const src = await prisma.stage.findUnique({ where: { id: sourceStageId } });
    if (src?.categoryId === categoryId) targets = await stageTargets(sourceStageId);
  }

  const rows = [...targets].filter(([, qty]) => qty > 0);

  await prisma.$transaction(async (tx) => {
    const stage = await tx.stage.create({ data: { categoryId, type } });
    if (rows.length === 0) return;
    await tx.stageTarget.createMany({
      data: rows.map(([orderSizeId, targetQty]) => ({
        stageId: stage.id,
        orderSizeId,
        targetQty,
      })),
    });
  });

  return null;
}

/**
 * Thêm một mục TỰ DO: chỉ có tên, không thuộc luồng sản xuất nào.
 *
 * `type` để null — nhờ vậy nó không lọt vào `bySize` của tiến độ, không có mặt
 * trong bộ lọc mục, và `@@unique([categoryId, type])` không chặn: MySQL coi mỗi
 * NULL là một giá trị riêng, nên thêm bao nhiêu mục tự do cũng được.
 */
export async function addCustomStageDb(
  categoryId: number,
  name: string
): Promise<string | null> {
  const label = name.trim();
  if (!label) return "Nhập tên mục.";

  const max = await prisma.stage.aggregate({
    where: { categoryId },
    _max: { position: true },
  });
  await prisma.stage.create({
    data: {
      categoryId,
      type: null,
      name: label,
      position: (max._max.position ?? -1) + 1,
    },
  });
  return null;
}

/**
 * Đổi tên một mục.
 *
 * Mục hệ thống: tên rỗng nghĩa là trả về nhãn mặc định của `type` — người dùng
 * xoá trắng ô là muốn bỏ cái tên mình đặt, không phải muốn một dòng không tên.
 * Mục tự do thì tên là thứ duy nhất nhận ra nó, nên rỗng là lỗi.
 */
export async function renameStageDb(
  stageId: number,
  name: string
): Promise<string | null> {
  const stage = await prisma.stage.findUnique({ where: { id: stageId } });
  if (!stage) return "Không tìm thấy mục.";

  const label = name.trim();
  if (!label && !stage.type) return "Mục tự do phải có tên.";

  await prisma.stage.update({
    where: { id: stageId },
    data: { name: label || null },
  });
  return null;
}

export async function setOrderNoteDb(orderId: number, note: string) {
  await prisma.productionOrder.update({
    where: { id: orderId },
    data: { note: note.trim() || null },
  });
}

export async function setMovementNoteDb(movementId: number, note: string) {
  await prisma.movement.update({
    where: { id: movementId },
    data: { note: note.trim() || null },
  });
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

    if (quantity > 0) {
      await tx.movementItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
      return;
    }

    // Xoá hẳn dòng 0 để phiếu không phình ra toàn số 0.
    await tx.movementItem.delete({ where: { id: existing.id } });

    // Vừa xoá trắng ô CUỐI CÙNG: phiếu không còn item nào. Một phiếu cũ nhận ra
    // chủ của nó qua chính các item ấy — hết item là hết đường suy, và dòng sẽ
    // biến mất ngay dưới tay người đang gõ. Nên cho nó tự khai chủ bằng
    // `stageId`, đúng như một đợt tạo từ bảng: xoá hết số thì dòng vẫn ở đó,
    // trống, chờ gõ lại.
    if ((await tx.movementItem.count({ where: { movementId } })) > 0) return;

    const mv = await tx.movement.findUnique({ where: { id: movementId } });
    if (!mv || mv.stageId != null || !mv.type) return;

    const size = await tx.orderSize.findUnique({
      where: { id: orderSizeId },
      select: { categoryId: true },
    });
    if (!size) return;

    const stage = await tx.stage.findFirst({
      where: { categoryId: size.categoryId, type: mv.type },
    });
    if (stage)
      await tx.movement.update({
        where: { id: movementId },
        data: { stageId: stage.id, partId },
      });
  });
}

export type NewBatchInput = {
  orderId: number;
  /** Mục sở hữu đợt này. Đợt rỗng chỉ nhận ra được nhờ nó. */
  stageId: number;
  /** null = mục tự do. */
  type: MovementType | null;
  /** yyyy-mm-dd */
  date: string;
  note?: string;
  /** Chỉ phiếu SEW_OUT mới gắn chi tiết. */
  partId: number | null;
  quantities: { orderSizeId: number; qty: number }[];
};

/**
 * Thêm một đợt mới, trả về id của nó để bảng thả con trỏ vào đúng dòng vừa đẻ ra.
 *
 * Cố ý KHÔNG đòi phải có số lượng: bấm "thêm đợt" là đẻ ra một dòng trắng, rồi
 * điền dần từng ô như trên một sheet Excel. Bù lại, dòng trắng không có item nào
 * để suy ngược ra chủ của nó, nên `stageId`/`partId` phải ghi thẳng lên phiếu.
 */
export async function addBatchDb(
  input: NewBatchInput
): Promise<{ error: string } | { id: number }> {
  const date = parseDate(input.date);
  if (!date) return { error: "Chọn ngày cho đợt này." };

  const items = input.quantities
    .map((q) => ({ orderSizeId: q.orderSizeId, quantity: clean(q.qty) }))
    .filter((q) => q.quantity > 0);

  const partId = input.type === "SEW_OUT" ? input.partId : null;

  const mv = await prisma.movement.create({
    data: {
      orderId: input.orderId,
      stageId: input.stageId,
      type: input.type,
      partId,
      date,
      note: input.note?.trim() || null,
      items: { create: items.map((i) => ({ ...i, partId })) },
    },
    select: { id: true },
  });
  return { id: mv.id };
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

    // Mục tự do sở hữu trọn vẹn các đợt của nó — không phiếu nào khác trỏ vào,
    // nên xoá thẳng cả phiếu (item cascade theo).
    if (!stage.type) {
      await tx.movement.deleteMany({ where: { stageId } });
      await tx.stage.delete({ where: { id: stageId } });
      return true;
    }

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
    // Dọn phiếu đã rỗng ruột. Chỉ những phiếu của CHÍNH mục này, cộng với phiếu
    // cũ chưa gắn mục (vừa bị lấy hết item ở trên) — nếu quét cả `type` thì đợt
    // RỖNG mà người dùng vừa mở ở một phân loại khác, cùng loại mục, cũng chết
    // theo dù không liên quan gì.
    await tx.movement.deleteMany({
      where: {
        orderId: stage.category.orderId,
        type: stage.type,
        items: { none: {} },
        OR: [{ stageId }, { stageId: null }],
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

  // OrderSize cascade kéo theo MovementItem, để lại phiếu rỗng; Stage cascade
  // thì gỡ `stageId` của các đợt thuộc phân loại vừa xoá về null. Chỉ dọn đúng
  // những phiếu KHÔNG CÒN CHỦ ấy — đợt rỗng mà người dùng vừa mở ở một phân loại
  // còn sống vẫn giữ nguyên `stageId`, và phải được để yên.
  await prisma.movement.deleteMany({
    where: { orderId: { in: orderIds }, items: { none: {} }, stageId: null },
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
