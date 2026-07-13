"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  importDraftsDb,
  probeCodesDb,
  type CodeStatus,
  type ImportResult,
} from "@/lib/import";
import type { ImportDraft } from "@/lib/import-tsv";
import {
  addBatchDb,
  addCustomStageDb,
  addPartDb,
  addStageDb,
  deleteBatchDb,
  deleteRowsDb,
  renameStageDb,
  setItemQtyDb,
  setMovementDateDb,
  setMovementNoteDb,
  setOrderCreatedAtDb,
  setOrderNoteDb,
  setPartTargetDb,
  setStageTargetDb,
  type DeleteSummary,
  type DeleteTarget,
  type NewBatchInput,
  type NewPartInput,
} from "@/lib/grid-write";
import type { MovementType } from "@prisma/client";

export type CellResult = { ok: boolean; error?: string };
export type { NewBatchInput, NewPartInput };

/** Danh mục size theo `position` — modal nhập nhanh cần để xem trước. */
export async function listSizeLabels(): Promise<string[]> {
  await requireSession();
  const rows = await prisma.sizeType.findMany({
    orderBy: [{ position: "asc" }, { label: "asc" }],
  });
  return rows.map((r) => r.label);
}

/** Tra xem các mã sắp nhập đã có trong DB chưa, và đã có những mục nào. */
export async function probeCodes(codes: string[]): Promise<CodeStatus[]> {
  await requireSession();
  return probeCodesDb(codes);
}

/**
 * Nhập nhanh nhiều LSX. Nhận các dòng nháp đã được soát/sửa trong modal —
 * `importDraftsDb` kiểm tra lại toàn bộ trước khi ghi.
 */
export async function importOrders(
  drafts: ImportDraft[]
): Promise<{ ok: boolean; error?: string; result?: ImportResult }> {
  await requireSession();
  try {
    const result = await importDraftsDb(drafts);
    if (result.addedStages.length > 0) revalidatePath("/");
    return { ok: true, result };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Lỗi khi nhập dữ liệu.",
    };
  }
}

/** Bọc lời gọi DB: kiểm tra phiên, làm mới cache, gói lỗi thành thông báo. */
async function guard(run: () => Promise<string | null>): Promise<CellResult> {
  await requireSession();
  try {
    const error = await run();
    if (error) return { ok: false, error };
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi lưu." };
  }
}

/** Sửa định mức của 1 ô (chi tiết × size) ở dòng "Gửi may". */
export async function setPartTarget(
  partId: number,
  orderSizeId: number,
  qty: number
): Promise<CellResult> {
  return guard(async () => {
    await setPartTargetDb(partId, orderSizeId, qty);
    return null;
  });
}

/** Sửa SL kế hoạch của một ô trên dòng cha (mục khác "Gửi may"). */
export async function setStageTarget(
  stageId: number,
  orderSizeId: number,
  qty: number
): Promise<CellResult> {
  return guard(() => setStageTargetDb(stageId, orderSizeId, qty));
}

/**
 * Thêm một mục (công đoạn) cho phân loại.
 * `sourceStageId` = mục đang bấm "+", để chép SL kế hoạch sang mục mới.
 */
export async function addStage(
  categoryId: number,
  type: MovementType,
  sourceStageId?: number
): Promise<CellResult> {
  return guard(() => addStageDb(categoryId, type, sourceStageId));
}

/** Thêm một mục tự do (chỉ có tên, không thuộc luồng sản xuất). */
export async function addCustomStage(
  categoryId: number,
  name: string
): Promise<CellResult> {
  return guard(() => addCustomStageDb(categoryId, name));
}

/** Đổi tên một mục; tên rỗng ở mục hệ thống = trả về nhãn mặc định. */
export async function renameStage(
  stageId: number,
  name: string
): Promise<CellResult> {
  return guard(() => renameStageDb(stageId, name));
}

/** Ghi chú của LSX. */
export async function setOrderNote(
  orderId: number,
  note: string
): Promise<CellResult> {
  return guard(async () => {
    await setOrderNoteDb(orderId, note);
    return null;
  });
}

/** Ghi chú của một đợt. */
export async function setMovementNote(
  movementId: number,
  note: string
): Promise<CellResult> {
  return guard(async () => {
    await setMovementNoteDb(movementId, note);
    return null;
  });
}

/** Sửa số lượng của 1 ô trong một đợt đã có. */
export async function setItemQty(
  movementId: number,
  orderSizeId: number,
  partId: number | null,
  qty: number
): Promise<CellResult> {
  return guard(async () => {
    await setItemQtyDb(movementId, orderSizeId, partId, qty);
    return null;
  });
}

/**
 * Thêm một đợt mới. Trả về `movementId` để bảng thả con trỏ vào đúng dòng vừa
 * tạo — không có nó thì sau `router.refresh()` người dùng phải tự đi tìm dòng
 * mới của mình giữa một bảng đã cuộn đi đâu mất.
 */
export async function addBatch(
  input: NewBatchInput
): Promise<CellResult & { movementId?: number }> {
  await requireSession();
  try {
    const res = await addBatchDb(input);
    if ("error" in res) return { ok: false, error: res.error };
    revalidatePath("/");
    return { ok: true, movementId: res.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi lưu." };
  }
}

/** Thêm một chi tiết (bán thành phẩm) mới kèm định mức. */
export async function addPart(input: NewPartInput): Promise<CellResult> {
  return guard(() => addPartDb(input));
}

/** Xoá một đợt (phiếu) khỏi lịch sử. */
export async function deleteBatch(movementId: number): Promise<CellResult> {
  return guard(async () => {
    await deleteBatchDb(movementId);
    return null;
  });
}

export type { DeleteTarget, DeleteSummary };

/**
 * Xoá đúng các dòng đã chọn: mỗi dòng là một mục của một phân loại.
 * Dòng giữ chỗ (phân loại chưa có mục) thì xoá phân loại, và xoá luôn LSX nếu
 * đó là phân loại cuối cùng.
 */
export async function deleteRows(
  targets: DeleteTarget[]
): Promise<CellResult & { summary?: DeleteSummary }> {
  await requireSession();
  try {
    const summary = await deleteRowsDb(targets);
    revalidatePath("/");
    return { ok: true, summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi khi xoá." };
  }
}

/** Sửa ngày tạo LSX (áp cho mọi dòng của LSX đó). */
export async function setOrderCreatedAt(
  orderId: number,
  iso: string
): Promise<CellResult> {
  return guard(() => setOrderCreatedAtDb(orderId, iso));
}

/** Sửa ngày của một đợt gửi/nhận. */
export async function setMovementDate(
  movementId: number,
  iso: string
): Promise<CellResult> {
  return guard(() => setMovementDateDb(movementId, iso));
}
