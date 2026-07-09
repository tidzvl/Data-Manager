import "server-only";
import { prisma } from "./db";
import { ps } from "./keys";
import type { MovementType, Prisma } from "@prisma/client";

export type SizeInfo = {
  id: number;
  sizeLabel: string;
  targetQty: number;
};

export type PartInfo = {
  id: number;
  name: string;
  color: string | null;
  /** targetQty theo sizeId */
  targets: Record<number, number>;
};

export type CategoryInfo = {
  id: number;
  name: string;
  sizes: SizeInfo[];
  parts: PartInfo[];
};

export type OrderDetail = {
  id: number;
  code: string;
  productName: string;
  status: "ACTIVE" | "DONE";
  note: string | null;
  createdAt: string; // yyyy-mm-dd
  lineId: number | null;
  lineName: string | null;
  categories: CategoryInfo[];

  /* ---- Tổng hợp derive từ Movement. Luồng: xuất chi tiết → đã may → thêu ---- */
  /** partId:sizeId -> chi tiết đã xuất về chuyền may */
  sewOut: Record<string, number>;
  /** sizeId -> hàng "đã may" chuyền gửi lên */
  sewInBySize: Record<number, number>;
  /** sizeId -> hàng đã may đã gửi đi thêu */
  embOutBySize: Record<number, number>;
  /** sizeId -> hàng đã nhận về từ xưởng thêu */
  embInBySize: Record<number, number>;
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const orderInclude = {
  line: true,
  categories: {
    orderBy: { position: "asc" },
    include: {
      orderSizes: { orderBy: { position: "asc" } },
      parts: { orderBy: { position: "asc" }, include: { targets: true } },
    },
  },
  movements: { include: { items: true } },
} satisfies Prisma.ProductionOrderInclude;

type OrderWithAll = Prisma.ProductionOrderGetPayload<{
  include: typeof orderInclude;
}>;

function buildDetail(order: OrderWithAll): OrderDetail {
  const d: OrderDetail = {
    id: order.id,
    code: order.code,
    productName: order.productName,
    status: order.status,
    note: order.note,
    createdAt: toDateStr(order.createdAt),
    lineId: order.lineId,
    lineName: order.line?.name ?? null,
    categories: order.categories.map((c) => ({
      id: c.id,
      name: c.name,
      sizes: c.orderSizes.map((s) => ({
        id: s.id,
        sizeLabel: s.sizeLabel,
        targetQty: s.targetQty,
      })),
      parts: c.parts.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        targets: Object.fromEntries(
          p.targets.map((t) => [t.orderSizeId, t.targetQty])
        ),
      })),
    })),
    sewOut: {},
    sewInBySize: {},
    embOutBySize: {},
    embInBySize: {},
  };

  for (const mv of order.movements) {
    for (const it of mv.items) {
      switch (mv.type) {
        case "SEW_OUT":
          // chi tiết → chuyền may: đếm theo (chi tiết, size)
          if (it.partId != null)
            d.sewOut[ps(it.partId, it.orderSizeId)] =
              (d.sewOut[ps(it.partId, it.orderSizeId)] ?? 0) + it.quantity;
          break;
        case "SEW_IN":
          d.sewInBySize[it.orderSizeId] =
            (d.sewInBySize[it.orderSizeId] ?? 0) + it.quantity;
          break;
        case "EMB_OUT":
          // gửi hàng đã may đi thêu: đếm theo size
          d.embOutBySize[it.orderSizeId] =
            (d.embOutBySize[it.orderSizeId] ?? 0) + it.quantity;
          break;
        case "EMB_IN":
          d.embInBySize[it.orderSizeId] =
            (d.embInBySize[it.orderSizeId] ?? 0) + it.quantity;
          break;
      }
    }
  }
  return d;
}

/** Nạp 1 LSX kèm toàn bộ số liệu tổng hợp derive từ Movement. */
export async function getOrderDetail(
  orderId: number
): Promise<OrderDetail | null> {
  const order = await prisma.productionOrder.findUnique({
    where: { id: orderId },
    include: orderInclude,
  });
  return order ? buildDetail(order) : null;
}

export type OrderProgress = {
  /** chi tiết đã xuất về chuyền / tổng chi tiết cần xuất */
  detailDone: number;
  detailTarget: number;
  /** hàng đã may chuyền gửi lên / SL kế hoạch */
  sewnDone: number;
  sewnTarget: number;
  /** hàng đã may đã gửi đi thêu, và đã nhận về */
  embSent: number;
  embBack: number;
  /** đang nằm ở xưởng thêu = gửi − nhận */
  atEmbroidery: number;
};

export function computeProgress(d: OrderDetail): OrderProgress {
  let detailDone = 0;
  let detailTarget = 0;
  let sewnTarget = 0;
  let sewnDone = 0;
  let embSent = 0;
  let embBack = 0;

  for (const c of d.categories) {
    for (const s of c.sizes) {
      sewnTarget += s.targetQty;
      sewnDone += d.sewInBySize[s.id] ?? 0;
      embSent += d.embOutBySize[s.id] ?? 0;
      embBack += d.embInBySize[s.id] ?? 0;
    }
    for (const p of c.parts) {
      for (const s of c.sizes) {
        detailTarget += p.targets[s.id] ?? 0;
        detailDone += d.sewOut[ps(p.id, s.id)] ?? 0;
      }
    }
  }
  return {
    detailDone,
    detailTarget,
    sewnDone,
    sewnTarget,
    embSent,
    embBack,
    atEmbroidery: embSent - embBack,
  };
}

export type OrderSummary = {
  id: number;
  code: string;
  productName: string;
  status: "ACTIVE" | "DONE";
  createdAt: string;
  lineName: string | null;
  progress: OrderProgress;
};

/** Danh sách LSX cho trang chủ, có lọc trạng thái và tìm kiếm. */
export async function getOrderSummaries(opts?: {
  status?: "ACTIVE" | "DONE";
  /** tìm theo mã LSX, tên sản phẩm, hoặc tên chuyền may */
  q?: string;
  lineId?: number;
}): Promise<OrderSummary[]> {
  const q = opts?.q?.trim();
  const where: Prisma.ProductionOrderWhereInput = {
    ...(opts?.status ? { status: opts.status } : {}),
    ...(opts?.lineId ? { lineId: opts.lineId } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q } },
            { productName: { contains: q } },
            { line: { name: { contains: q } } },
          ],
        }
      : {}),
  };

  const orders = await prisma.productionOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: orderInclude,
  });

  return orders.map((o) => {
    const d = buildDetail(o);
    return {
      id: d.id,
      code: d.code,
      productName: d.productName,
      status: d.status,
      createdAt: d.createdAt,
      lineName: d.lineName,
      progress: computeProgress(d),
    };
  });
}

export type MovementView = {
  id: number;
  orderId: number;
  orderCode: string;
  lineName: string | null;
  type: MovementType;
  date: string; // yyyy-mm-dd
  note: string | null;
  total: number;
  items: {
    categoryName: string;
    partName: string | null;
    partColor: string | null;
    sizeLabel: string;
    quantity: number;
  }[];
};

/** Danh sách phiếu của 1 LSX (hoặc toàn bộ nếu orderId undefined). */
export async function getMovements(orderId?: number): Promise<MovementView[]> {
  const movements = await prisma.movement.findMany({
    where: orderId ? { orderId } : undefined,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      order: { select: { code: true, line: { select: { name: true } } } },
      items: {
        include: {
          part: { select: { name: true, color: true } },
          orderSize: {
            select: { sizeLabel: true, category: { select: { name: true } } },
          },
        },
      },
    },
  });

  return movements.map((mv) => ({
    id: mv.id,
    orderId: mv.orderId,
    orderCode: mv.order.code,
    lineName: mv.order.line?.name ?? null,
    type: mv.type,
    date: toDateStr(mv.date),
    note: mv.note,
    total: mv.items.reduce((a, it) => a + it.quantity, 0),
    items: mv.items.map((it) => ({
      categoryName: it.orderSize.category.name,
      partName: it.part?.name ?? null,
      partColor: it.part?.color ?? null,
      sizeLabel: it.orderSize.sizeLabel,
      quantity: it.quantity,
    })),
  }));
}

export { ps };
