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

/** Số bản ghi mặc định trên 1 trang. */
export const PER_PAGE = 20;

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};

function pageInfo(total: number, page: number, perPage: number) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  return { totalPages, current };
}

/** Các cột có thể sắp xếp ở DB (tiến độ là số dẫn xuất nên không sort được). */
export const ORDER_SORTS = [
  "createdAt",
  "code",
  "productName",
  "line",
  "status",
] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

function orderByFor(
  sort: OrderSort,
  dir: "asc" | "desc"
): Prisma.ProductionOrderOrderByWithRelationInput {
  if (sort === "line") return { line: { name: dir } };
  return { [sort]: dir } as Prisma.ProductionOrderOrderByWithRelationInput;
}

/** Danh sách LSX cho trang chủ: lọc trạng thái, tìm kiếm, sắp xếp, phân trang. */
export async function getOrderSummaries(opts?: {
  status?: "ACTIVE" | "DONE";
  /** tìm theo mã LSX, tên sản phẩm, hoặc tên chuyền may */
  q?: string;
  lineId?: number;
  page?: number;
  perPage?: number;
  sort?: OrderSort;
  dir?: "asc" | "desc";
}): Promise<Paged<OrderSummary>> {
  const q = opts?.q?.trim();
  const perPage = opts?.perPage ?? PER_PAGE;
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

  const total = await prisma.productionOrder.count({ where });
  const { totalPages, current } = pageInfo(total, opts?.page ?? 1, perPage);

  const orders = await prisma.productionOrder.findMany({
    where,
    orderBy: orderByFor(opts?.sort ?? "createdAt", opts?.dir ?? "desc"),
    include: orderInclude,
    skip: (current - 1) * perPage,
    take: perPage,
  });

  return {
    items: orders.map((o) => {
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
    }),
    total,
    page: current,
    perPage,
    totalPages,
  };
}

export type OrderNavItem = {
  id: number;
  code: string;
  productName: string;
  status: "ACTIVE" | "DONE";
  lineName: string | null;
};

/**
 * Danh sách LSX rút gọn cho menu truy cập nhanh.
 * Không nạp categories/movements nên rất nhẹ. Đang chạy xếp trước.
 */
export async function getOrderNavList(limit = 200): Promise<OrderNavItem[]> {
  const rows = await prisma.productionOrder.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      code: true,
      productName: true,
      status: true,
      line: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    productName: r.productName,
    status: r.status,
    lineName: r.line?.name ?? null,
  }));
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

const movementInclude = {
  order: { select: { code: true, line: { select: { name: true } } } },
  items: {
    include: {
      part: { select: { name: true, color: true } },
      orderSize: {
        select: { sizeLabel: true, category: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.MovementInclude;

type MovementWithAll = Prisma.MovementGetPayload<{
  include: typeof movementInclude;
}>;

function toMovementView(mv: MovementWithAll): MovementView {
  return {
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
  };
}

const MOVEMENT_ORDER: Prisma.MovementOrderByWithRelationInput[] = [
  { date: "desc" },
  { createdAt: "desc" },
];

/** Toàn bộ phiếu của 1 LSX (số lượng có giới hạn theo lệnh, lọc ở client). */
export async function getOrderMovements(
  orderId: number
): Promise<MovementView[]> {
  const movements = await prisma.movement.findMany({
    where: { orderId },
    orderBy: MOVEMENT_ORDER,
    include: movementInclude,
  });
  return movements.map(toMovementView);
}

function parseDay(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

/** Nhật ký toàn cục: lọc + phân trang trên server. */
export async function getJournal(opts?: {
  q?: string;
  type?: MovementType;
  /** yyyy-mm-dd */
  day?: string;
  page?: number;
  perPage?: number;
}): Promise<Paged<MovementView>> {
  const q = opts?.q?.trim();
  const perPage = opts?.perPage ?? PER_PAGE;
  const day = opts?.day ? parseDay(opts.day) : undefined;

  const where: Prisma.MovementWhereInput = {
    ...(opts?.type ? { type: opts.type } : {}),
    ...(day ? { date: day } : {}),
    ...(q
      ? {
          OR: [
            { note: { contains: q } },
            { order: { code: { contains: q } } },
            { order: { productName: { contains: q } } },
            { order: { line: { name: { contains: q } } } },
            { items: { some: { part: { name: { contains: q } } } } },
            {
              items: { some: { orderSize: { sizeLabel: { contains: q } } } },
            },
            {
              items: {
                some: { orderSize: { category: { name: { contains: q } } } },
              },
            },
          ],
        }
      : {}),
  };

  const total = await prisma.movement.count({ where });
  const { totalPages, current } = pageInfo(total, opts?.page ?? 1, perPage);

  const movements = await prisma.movement.findMany({
    where,
    orderBy: MOVEMENT_ORDER,
    include: movementInclude,
    skip: (current - 1) * perPage,
    take: perPage,
  });

  return {
    items: movements.map(toMovementView),
    total,
    page: current,
    perPage,
    totalPages,
  };
}

export { ps };
