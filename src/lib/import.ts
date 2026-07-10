import "server-only";
import { prisma } from "./db";
import { draftLabel, validateDrafts, type ImportDraft } from "./import-tsv";
import { pickPartColor } from "./part-colors";
import type { Prisma } from "@prisma/client";

export type ImportSkip = { label: string; reason: string };

export type ImportResult = {
  /** Mã các LSX được tạo mới. */
  createdOrders: string[];
  /** Nhãn các mục được thêm (kể cả mục của LSX vừa tạo). */
  addedStages: string[];
  /** Dòng bị bỏ qua kèm lý do. */
  skipped: ImportSkip[];
  /** Tên chuyền may được tạo mới. */
  newLines: string[];
  /** Chi tiết được thêm vào danh mục dùng chung. */
  newPartTypes: string[];
};

type PartTypeInfo = { name: string; color: string };
type Tx = Prisma.TransactionClient;

/**
 * Ghi các dòng nháp (đã soát và sửa trong modal) vào DB.
 *
 * Một dòng nháp = một `Stage`, tức đúng bộ ba (LSX × Phân loại × Mục).
 *
 * LSX đã tồn tại thì KHÔNG bỏ qua nữa: dòng nháp được ghép thêm vào nó. Đang có
 * `LSX-1 · Áo · Nhận may` mà dán `LSX-1 · Áo · Gửi may` thì thêm mục Gửi may.
 * Chỉ bỏ qua khi đúng cả ba đã tồn tại. LSX cũ không bị sửa tên/chuyền, và
 * không có gì bị ghi đè — nên lịch sử gửi/nhận luôn an toàn.
 *
 * Sheet cho SL KẾ HOẠCH nên import không tạo `Movement` nào:
 *   - "Gửi may" → định mức từng chi tiết (`PartTarget`)
 *   - còn lại   → `StageTarget` của chính công đoạn đó
 */
export async function importDraftsDb(
  drafts: ImportDraft[]
): Promise<ImportResult> {
  const invalid = validateDrafts(drafts);
  if (invalid) throw new Error(invalid);

  const sizeTypes = await prisma.sizeType.findMany({
    orderBy: [{ position: "asc" }, { label: "asc" }],
  });
  const sizeLabels = sizeTypes.map((s) => s.label);
  for (const d of drafts) {
    if (d.qty.length !== sizeLabels.length)
      throw new Error(
        `Số cột size (${d.qty.length}) không khớp danh mục (${sizeLabels.length}).`
      );
  }

  const result: ImportResult = {
    createdOrders: [],
    addedStages: [],
    skipped: [],
    newLines: [],
    newPartTypes: [],
  };

  const lineIds = await resolveLines(drafts, result);
  const partTypes = await resolvePartTypes(drafts, result);

  for (const draft of drafts) {
    // Mỗi dòng nháp một transaction: một dòng hỏng không kéo đổ các dòng khác.
    const skip = await prisma.$transaction((tx) =>
      applyDraft(tx, draft, sizeLabels, lineIds, partTypes, result)
    );
    if (skip) result.skipped.push({ label: draftLabel(draft), reason: skip });
  }
  return result;
}

/** @returns lý do bỏ qua, hoặc null nếu đã ghi. */
async function applyDraft(
  tx: Tx,
  draft: ImportDraft,
  sizeLabels: string[],
  lineIds: Map<string, number>,
  partTypes: Map<string, PartTypeInfo>,
  result: ImportResult
): Promise<string | null> {
  const code = draft.code.trim();

  let order = await tx.productionOrder.findUnique({ where: { code } });
  if (!order) {
    order = await tx.productionOrder.create({
      data: {
        code,
        productName: draft.productName.trim(),
        lineId: draft.lineName ? (lineIds.get(draft.lineName) ?? null) : null,
      },
    });
    result.createdOrders.push(code);
  }

  const categoryName = draft.categoryName.trim();
  let category = await tx.category.findFirst({
    where: { orderId: order.id, name: categoryName },
  });
  if (!category) {
    const max = await tx.category.aggregate({
      where: { orderId: order.id },
      _max: { position: true },
    });
    category = await tx.category.create({
      data: {
        orderId: order.id,
        name: categoryName,
        position: (max._max.position ?? -1) + 1,
      },
    });
  }

  const existingStage = await tx.stage.findUnique({
    where: { categoryId_type: { categoryId: category.id, type: draft.muc } },
  });
  if (existingStage) return "Mục này của LSX đã tồn tại.";

  const sizeIdByIndex = await ensureSizes(tx, category.id, draft, sizeLabels);

  if (draft.muc === "SEW_OUT") {
    await tx.stage.create({ data: { categoryId: category.id, type: "SEW_OUT" } });
    await createParts(tx, category.id, draft, sizeIdByIndex, partTypes);
  } else {
    await tx.stage.create({
      data: {
        categoryId: category.id,
        type: draft.muc,
        targets: {
          create: draft.qty
            .map((q, si) => ({ q, sizeId: sizeIdByIndex.get(si) }))
            .filter((x) => x.q > 0 && x.sizeId != null)
            .map((x) => ({ orderSizeId: x.sizeId!, targetQty: x.q })),
        },
      },
    });
  }

  result.addedStages.push(draftLabel(draft));
  return null;
}

/**
 * Bảo đảm phân loại có đủ `OrderSize` cho các size mà dòng nháp dùng.
 * Size đã có thì giữ nguyên `targetQty` — nó là SL kế hoạch chung của phân loại,
 * ghi đè bằng số của mục mới là hỏng dữ liệu cũ.
 *
 * @returns chỉ số size (theo danh mục) → orderSizeId
 */
async function ensureSizes(
  tx: Tx,
  categoryId: number,
  draft: ImportDraft,
  sizeLabels: string[]
): Promise<Map<number, number>> {
  const existing = await tx.orderSize.findMany({ where: { categoryId } });
  const byLabel = new Map(existing.map((s) => [s.sizeLabel, s.id]));
  let position = existing.reduce((m, s) => Math.max(m, s.position), -1) + 1;

  // Với "Gửi may", định mức chi tiết mới là nguồn size, không phải qty dòng cha.
  const used = new Set<number>();
  draft.qty.forEach((q, si) => q > 0 && used.add(si));
  for (const p of draft.parts) p.qty.forEach((q, si) => q > 0 && used.add(si));

  const map = new Map<number, number>();
  for (const si of [...used].sort((a, b) => a - b)) {
    const label = sizeLabels[si];
    let id = byLabel.get(label);
    if (id == null) {
      const created = await tx.orderSize.create({
        data: {
          categoryId,
          sizeLabel: label,
          targetQty: draft.qty[si],
          position: position++,
        },
      });
      id = created.id;
    }
    map.set(si, id);
  }
  return map;
}

/** Chi tiết đã có tên trùng trong phân loại thì bỏ qua, khỏi nhân đôi. */
async function createParts(
  tx: Tx,
  categoryId: number,
  draft: ImportDraft,
  sizeIdByIndex: Map<number, number>,
  partTypes: Map<string, PartTypeInfo>
) {
  const existing = await tx.part.findMany({ where: { categoryId } });
  const taken = new Set(existing.map((p) => p.name.toLowerCase()));
  let position = existing.reduce((m, p) => Math.max(m, p.position), -1) + 1;

  for (const part of draft.parts) {
    const raw = part.name.trim();
    const canonical = partTypes.get(raw.toLowerCase());
    const name = canonical?.name ?? raw;
    if (taken.has(name.toLowerCase())) continue;
    taken.add(name.toLowerCase());

    await tx.part.create({
      data: {
        categoryId,
        name,
        color: canonical?.color ?? null,
        position: position++,
        targets: {
          create: part.qty
            .map((q, si) => ({ q, sizeId: sizeIdByIndex.get(si) }))
            .filter((x) => x.q > 0 && x.sizeId != null)
            .map((x) => ({ orderSizeId: x.sizeId!, targetQty: x.q })),
        },
      },
    });
  }
}

/** Map tên chuyền → id, tạo mới những tên chưa có. */
async function resolveLines(
  drafts: ImportDraft[],
  result: ImportResult
): Promise<Map<string, number>> {
  const names = [...new Set(drafts.map((d) => d.lineName).filter(Boolean))];
  const map = new Map<string, number>();
  if (names.length === 0) return map;

  const found = await prisma.sewingLine.findMany({
    where: { name: { in: names } },
  });
  for (const l of found) map.set(l.name, l.id);

  for (const name of names) {
    if (map.has(name)) continue;
    const created = await prisma.sewingLine.create({ data: { name } });
    map.set(name, created.id);
    result.newLines.push(name);
  }
  return map;
}

/**
 * Map tên chi tiết (chữ thường) → bản ghi trong danh mục dùng chung.
 * Tên chưa có thì thêm vào danh mục kèm màu, đúng như khi tạo LSX bằng form:
 * không làm vậy thì mọi chi tiết import về đều xám và danh mục không lớn lên.
 * Đồng thời gộp "bo cổ" và "Bo cổ" về cùng một tên chuẩn.
 */
async function resolvePartTypes(
  drafts: ImportDraft[],
  result: ImportResult
): Promise<Map<string, PartTypeInfo>> {
  const existing = await prisma.partType.findMany({
    select: { name: true, color: true },
  });
  const map = new Map<string, PartTypeInfo>(
    existing.map((t) => [t.name.toLowerCase(), { name: t.name, color: t.color }])
  );

  const used = new Set(existing.map((t) => t.color));
  let seq = existing.length;
  const agg = await prisma.partType.aggregate({ _max: { position: true } });
  let position = (agg._max.position ?? -1) + 1;

  for (const d of drafts) {
    if (d.muc !== "SEW_OUT") continue;
    for (const p of d.parts) {
      const name = p.name.trim();
      const key = name.toLowerCase();
      if (!name || map.has(key)) continue;

      const color = pickPartColor(used, seq++);
      used.add(color);
      const created = await prisma.partType.create({
        data: { name, color, position: position++ },
      });
      map.set(key, { name: created.name, color: created.color });
      result.newPartTypes.push(created.name);
    }
  }
  return map;
}

/** Tình trạng hiện có của các mã sắp nhập, để bảng xem trước báo trước. */
export type CodeStatus = {
  code: string;
  /** categoryName (chữ thường) → các mục đã có */
  categories: Record<string, string[]>;
};

export async function probeCodesDb(codes: string[]): Promise<CodeStatus[]> {
  if (codes.length === 0) return [];
  const orders = await prisma.productionOrder.findMany({
    where: { code: { in: codes } },
    include: { categories: { include: { stages: true } } },
  });
  return orders.map((o) => ({
    code: o.code,
    categories: Object.fromEntries(
      o.categories.map((c) => [
        c.name.toLowerCase(),
        c.stages.map((s) => s.type),
      ])
    ),
  }));
}
