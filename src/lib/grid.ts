import "server-only";
import { prisma } from "./db";
import { ps } from "./keys";
import {
  MUC_LABEL,
  MUC_TYPES,
  type Cell,
  type GridChild,
  type GridOrder,
  type GridPage,
  type GridRow,
  type GridSort,
  type SizeColumn,
} from "./grid-types";
import type { MovementType, Prisma } from "@prisma/client";

/**
 * Nguồn dữ liệu cho bảng kính một-trang.
 *
 * Một dòng cha = (LSX × Phân loại × Mục). Cột size lấy từ danh mục SizeType
 * dùng chung nên mọi dòng canh cột được với nhau; phân loại nào không khai báo
 * size đó thì ô để trống và không sửa được.
 */

const gridInclude = {
  line: true,
  categories: {
    orderBy: { position: "asc" },
    include: {
      orderSizes: { orderBy: { position: "asc" } },
      parts: { orderBy: { position: "asc" }, include: { targets: true } },
      stages: { include: { targets: true } },
    },
  },
  movements: { orderBy: { date: "asc" }, include: { items: true } },
} satisfies Prisma.ProductionOrderInclude;

type OrderWithAll = Prisma.ProductionOrderGetPayload<{
  include: typeof gridInclude;
}>;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** dd/mm — ngày của một đợt gửi/nhận. */
function dayLabel(d: Date): string {
  const s = toDateStr(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}

/** dd/mm/yyyy — ngày tạo LSX. */
function fullDayLabel(d: Date): string {
  const s = toDateStr(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

/** Danh mục size dùng làm cột — thứ tự theo `position`. */
export async function getSizeColumns(): Promise<SizeColumn[]> {
  const rows = await prisma.sizeType.findMany({
    orderBy: [{ position: "asc" }, { label: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, label: r.label }));
}

/**
 * Số liệu của 1 LSX, gom sẵn theo (chi tiết, size) và theo size.
 * Giống `buildDetail` trong aggregate.ts nhưng giữ luôn từng Movement để dựng
 * dòng con "đợt".
 */
function tally(order: OrderWithAll) {
  /** partId:orderSizeId -> đã xuất về chuyền */
  const sewOut: Record<string, number> = {};
  const bySize: Record<MovementType, Record<number, number>> = {
    SEW_OUT: {},
    SEW_IN: {},
    EMB_OUT: {},
    EMB_IN: {},
  };

  for (const mv of order.movements) {
    for (const it of mv.items) {
      bySize[mv.type][it.orderSizeId] =
        (bySize[mv.type][it.orderSizeId] ?? 0) + it.quantity;
      if (mv.type === "SEW_OUT" && it.partId != null) {
        const k = ps(it.partId, it.orderSizeId);
        sewOut[k] = (sewOut[k] ?? 0) + it.quantity;
      }
    }
  }
  return { sewOut, bySize };
}

type Category = OrderWithAll["categories"][number];
type Stage = Category["stages"][number];

/** Số thực tế đã gửi/nhận của một mục tại một size — chính là số hiển thị ở ô. */
function doneFor(
  muc: MovementType,
  orderSizeId: number,
  t: ReturnType<typeof tally>
): number {
  return t.bySize[muc][orderSizeId] ?? 0;
}

/**
 * Các dòng "đợt" của một mục, giới hạn trong 1 phân loại (và 1 chi tiết nếu có).
 * Phiếu nào không chạm tới phân loại này thì bỏ hẳn — số thứ tự đợt đánh sau
 * khi lọc, nếu không nhãn sẽ nhảy cóc ("đợt 1, đợt 3").
 */
function batchRows(
  movements: OrderWithAll["movements"],
  cat: Category,
  cols: SizeColumn[],
  sizeByLabel: Map<string, number>,
  partId: number | null
): GridChild[] {
  const sizeIds = new Set(cat.orderSizes.map((s) => s.id));

  return movements
    .map((mv) => ({
      mv,
      items: mv.items.filter(
        (it) =>
          (partId == null || it.partId === partId) && sizeIds.has(it.orderSizeId)
      ),
    }))
    .filter((x) => x.items.length > 0)
    .map(({ mv, items }, index) => {
      const qty: Record<number, number> = {};
      for (const it of items)
        qty[it.orderSizeId] = (qty[it.orderSizeId] ?? 0) + it.quantity;

      const cells = cols.map<Cell>((c) => {
        const osid = sizeByLabel.get(c.label) ?? null;
        return {
          orderSizeId: osid,
          value: osid ? (qty[osid] ?? 0) : 0,
          done: 0,
          target: 0,
        };
      });

      const verb =
        mv.type === "SEW_OUT" || mv.type === "EMB_OUT" ? "Đã gửi" : "Đã nhận";
      return {
        key: `mv-${mv.id}-${partId ?? "all"}`,
        label: `${verb} đợt ${index + 1}`,
        dateLabel: dayLabel(mv.date),
        dateIso: toDateStr(mv.date),
        note: mv.note,
        color: null,
        cells,
        total: sum(cells.map((c) => c.value)),
        edit: "item" as const,
        partId,
        movementId: mv.id,
      };
    });
}

function buildRows(
  order: OrderWithAll,
  cols: SizeColumn[],
  plan: number[]
): GridRow[] {
  const t = tally(order);
  const rows: GridRow[] = [];

  for (const cat of order.categories) {
    const sizeByLabel = new Map(cat.orderSizes.map((s) => [s.sizeLabel, s.id]));

    // Chỉ những công đoạn đã được tạo mới thành dòng. Sắp theo luồng sản xuất
    // chứ không theo thứ tự tạo, để bảng đọc được.
    const stages = MUC_TYPES.map((m) =>
      cat.stages.find((s) => s.type === m)
    ).filter((s): s is Stage => s !== undefined);

    const missingMucs = MUC_TYPES.filter(
      (m) => !cat.stages.some((s) => s.type === m)
    );

    for (const stage of stages) {
      const muc = stage.type;
      const cells = cols.map<Cell>((c, i) => {
        const osid = sizeByLabel.get(c.label) ?? null;
        if (!osid) return { orderSizeId: null, value: 0, done: 0, target: 0 };
        // Ô hiện TỔNG CÁC ĐỢT của mục này — số thật đã gửi/nhận, để đối chiếu
        // thẳng với SL gốc ở dòng LSX ngay phía trên. Không còn là SL kế hoạch
        // riêng của mục nữa (StageTarget không lên bảng).
        const done = doneFor(muc, osid, t);
        return {
          orderSizeId: osid,
          value: done,
          done,
          // Đích để so là SL GỐC của LSX, không phải kế hoạch riêng của mục.
          target: plan[i],
        };
      });

      let children: GridChild[] = [];
      let childHeader: string;

      if (muc === "SEW_OUT") {
        childHeader = "Chi tiết bán thành phẩm";
        const sewOutMvs = order.movements.filter((m) => m.type === "SEW_OUT");

        children = cat.parts.map((p) => {
          const partCells = cols.map<Cell>((c) => {
            const osid = sizeByLabel.get(c.label) ?? null;
            if (!osid) return { orderSizeId: null, value: 0, done: 0, target: 0 };
            const target =
              p.targets.find((x) => x.orderSizeId === osid)?.targetQty ?? 0;
            return {
              orderSizeId: osid,
              value: target,
              done: t.sewOut[ps(p.id, osid)] ?? 0,
              target,
            };
          });

          const batches = batchRows(sewOutMvs, cat, cols, sizeByLabel, p.id);

          return {
            key: `part-${p.id}`,
            label: p.name,
            dateLabel: "",
            dateIso: null,
            note: "Định mức",
            color: p.color,
            cells: partCells,
            total: sum(partCells.map((c) => c.value)),
            edit: "target",
            partId: p.id,
            movementId: null,
            batches,
          };
        });
      } else {
        childHeader = `Lịch sử ${MUC_LABEL[muc].toLowerCase()}`;
        children = batchRows(
          order.movements.filter((m) => m.type === muc),
          cat,
          cols,
          sizeByLabel,
          null
        );
      }

      rows.push({
        key: `stage-${stage.id}`,
        stageId: stage.id,
        orderId: order.id,
        code: order.code,
        productName: order.productName,
        lineName: order.line?.name ?? null,
        categoryId: cat.id,
        categoryName: cat.name,
        muc,
        mucLabel: MUC_LABEL[muc],
        missingMucs,
        note: order.note,
        createdAt: fullDayLabel(order.createdAt),
        createdAtIso: toDateStr(order.createdAt),
        cells,
        total: sum(cells.map((c) => c.value)),
        children,
        childHeader,
      });
    }

    // Phân loại chưa có công đoạn nào vẫn phải hiện được, nếu không sẽ không có
    // chỗ nào để bấm "Thêm mục".
    if (stages.length === 0) {
      rows.push(emptyCategoryRow(order, cat, cols, missingMucs));
    }
  }
  return rows;
}

/**
 * Dòng giữ chỗ cho phân loại chưa có công đoạn nào. `stageId = 0` nên mọi thao
 * tác sửa đều bị chặn; nó chỉ mang nút "Thêm mục".
 */
function emptyCategoryRow(
  order: OrderWithAll,
  cat: Category,
  cols: SizeColumn[],
  missingMucs: MovementType[]
): GridRow {
  const sizeByLabel = new Map(cat.orderSizes.map((s) => [s.sizeLabel, s.id]));
  return {
    key: `cat-${cat.id}-empty`,
    stageId: 0,
    orderId: order.id,
    code: order.code,
    productName: order.productName,
    lineName: order.line?.name ?? null,
    categoryId: cat.id,
    categoryName: cat.name,
    muc: "SEW_OUT",
    mucLabel: "—",
    missingMucs,
    note: order.note,
    createdAt: fullDayLabel(order.createdAt),
    createdAtIso: toDateStr(order.createdAt),
    cells: cols.map((c) => ({
      orderSizeId: sizeByLabel.get(c.label) ?? null,
      value: 0,
      done: 0,
      target: 0,
    })),
    total: 0,
    children: [],
    childHeader: "",
  };
}

/**
 * SL GỐC của LSX theo từng cột size — con số kế hoạch mà mọi mục phải đạt tới.
 *
 * KHÔNG cộng các phân loại lại. Một LSX bộ đồ có "Áo" và "Quần" là hai phân loại
 * của CÙNG 200 bộ, không phải 400 sản phẩm; cộng vào là nhân đôi kế hoạch. Lấy
 * max: các phân loại vốn khai cùng một số, và nếu có lệch thì gốc là cái lớn nhất.
 */
function planFor(order: OrderWithAll, cols: SizeColumn[]): number[] {
  const byLabel = new Map<string, number>();
  for (const cat of order.categories)
    for (const s of cat.orderSizes)
      byLabel.set(
        s.sizeLabel,
        Math.max(byLabel.get(s.sizeLabel) ?? 0, s.targetQty)
      );

  return cols.map((c) => byLabel.get(c.label) ?? 0);
}

function buildOrder(
  order: OrderWithAll,
  cols: SizeColumn[],
  plan: number[],
  rows: GridRow[]
): GridOrder {
  return {
    key: `order-${order.id}`,
    orderId: order.id,
    code: order.code,
    productName: order.productName,
    lineName: order.line?.name ?? null,
    note: order.note,
    createdAt: fullDayLabel(order.createdAt),
    createdAtIso: toDateStr(order.createdAt),
    plan,
    planTotal: sum(plan),
    rows,
  };
}

function orderByFor(
  sort: GridSort,
  dir: "asc" | "desc"
): Prisma.ProductionOrderOrderByWithRelationInput {
  if (sort === "line") return { line: { name: dir } };
  return { [sort]: dir } as Prisma.ProductionOrderOrderByWithRelationInput;
}

function parseDay(s: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : undefined;
}

export type GridFilters = {
  q?: string;
  /** yyyy-mm-dd — giữ LSX có ít nhất 1 phiếu trong ngày đó. */
  day?: string;
  muc?: MovementType;
  sort?: GridSort;
  dir?: "asc" | "desc";
};

function whereFor(opts: GridFilters): Prisma.ProductionOrderWhereInput {
  const q = opts.q?.trim();
  const day = opts.day ? parseDay(opts.day) : undefined;
  return {
    ...(day ? { movements: { some: { date: day } } } : {}),
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
}

/** Dòng giữ chỗ của phân loại rỗng không có nghĩa khi lọc theo mục. */
function applyMucFilter(rows: GridRow[], muc?: MovementType): GridRow[] {
  return muc ? rows.filter((r) => r.stageId > 0 && r.muc === muc) : rows;
}

/**
 * Trang dữ liệu cho bảng kính.
 * Phân trang tính theo LSX — một LSX sinh nhiều dòng (mỗi phân loại × mỗi mục).
 */
export async function getGridPage(
  opts: GridFilters & { page?: number; perPage?: number }
): Promise<GridPage> {
  const perPage = opts.perPage ?? 20;
  const where = whereFor(opts);

  const [columns, total] = await Promise.all([
    getSizeColumns(),
    prisma.productionOrder.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, opts.page ?? 1), totalPages);

  const orders = await prisma.productionOrder.findMany({
    where,
    orderBy: orderByFor(opts.sort ?? "createdAt", opts.dir ?? "desc"),
    include: gridInclude,
    skip: (page - 1) * perPage,
    take: perPage,
  });

  // Lọc theo mục xong mới gói vào LSX: LSX nào không còn mục nào khớp thì
  // không có gì để xem, bỏ hẳn khỏi bảng thay vì hiện một dòng cha rỗng.
  const nodes = orders
    .map((o) => {
      const plan = planFor(o, columns);
      return buildOrder(o, columns, plan, applyMucFilter(buildRows(o, columns, plan), opts.muc));
    })
    .filter((o) => !opts.muc || o.rows.length > 0);

  return {
    columns,
    orders: nodes,
    rowCount: sum(nodes.map((o) => o.rows.length)),
    total,
    page,
    perPage,
    totalPages,
  };
}

/**
 * Mọi dòng khớp bộ lọc, không phân trang — dùng cho xuất file.
 * Dòng giữ chỗ (phân loại chưa có mục) bị loại: không có gì để xuất.
 */
export async function getGridExport(
  opts: GridFilters
): Promise<{ columns: SizeColumn[]; rows: GridRow[] }> {
  const columns = await getSizeColumns();
  const orders = await prisma.productionOrder.findMany({
    where: whereFor(opts),
    orderBy: orderByFor(opts.sort ?? "createdAt", opts.dir ?? "desc"),
    include: gridInclude,
  });

  const rows = applyMucFilter(
    orders.flatMap((o) => buildRows(o, columns, planFor(o, columns))),
    opts.muc
  ).filter((r) => r.stageId > 0);

  return { columns, rows };
}

/** Đúng các dòng đã tick, giữ nguyên thứ tự của bảng. */
export async function getGridRowsByStages(
  stageIds: number[]
): Promise<{ columns: SizeColumn[]; rows: GridRow[] }> {
  const columns = await getSizeColumns();
  if (stageIds.length === 0) return { columns, rows: [] };

  const orders = await prisma.productionOrder.findMany({
    where: { categories: { some: { stages: { some: { id: { in: stageIds } } } } } },
    orderBy: { createdAt: "desc" },
    include: gridInclude,
  });

  const wanted = new Set(stageIds);
  const rows = orders
    .flatMap((o) => buildRows(o, columns, planFor(o, columns)))
    .filter((r) => wanted.has(r.stageId));

  return { columns, rows };
}
