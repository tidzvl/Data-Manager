"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { pickPartColor } from "@/lib/part-colors";

export type SizeTypeDto = { id: number; label: string };
export type PartTypeDto = { id: number; name: string; color: string };

export async function listSizeTypes(): Promise<SizeTypeDto[]> {
  await requireSession();
  const rows = await prisma.sizeType.findMany({
    orderBy: [{ position: "asc" }, { label: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, label: r.label }));
}

export async function listPartTypes(): Promise<PartTypeDto[]> {
  await requireSession();
  const rows = await prisma.partType.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name, color: r.color }));
}

export type TypeResult<T> = { ok: boolean; error?: string; item?: T };

/** Thêm kích thước mới vào danh mục (dùng lại nếu đã có). */
export async function createSizeType(
  label: string
): Promise<TypeResult<SizeTypeDto>> {
  await requireSession();
  const clean = label.trim();
  if (!clean) return { ok: false, error: "Nhập tên kích thước." };

  const existing = await prisma.sizeType.findUnique({ where: { label: clean } });
  if (existing) return { ok: true, item: { id: existing.id, label: existing.label } };

  const max = await prisma.sizeType.aggregate({ _max: { position: true } });
  const row = await prisma.sizeType.create({
    data: { label: clean, position: (max._max.position ?? -1) + 1 },
  });
  revalidatePath("/settings");
  return { ok: true, item: { id: row.id, label: row.label } };
}

/** Thêm chi tiết mới vào danh mục, tự gán màu chưa dùng. */
export async function createPartType(
  name: string
): Promise<TypeResult<PartTypeDto>> {
  await requireSession();
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Nhập tên chi tiết." };

  const existing = await prisma.partType.findUnique({ where: { name: clean } });
  if (existing)
    return {
      ok: true,
      item: { id: existing.id, name: existing.name, color: existing.color },
    };

  const all = await prisma.partType.findMany({ select: { color: true } });
  const used = new Set(all.map((p) => p.color));
  const color = pickPartColor(used, all.length);

  const max = await prisma.partType.aggregate({ _max: { position: true } });
  const row = await prisma.partType.create({
    data: { name: clean, color, position: (max._max.position ?? -1) + 1 },
  });
  revalidatePath("/settings");
  return { ok: true, item: { id: row.id, name: row.name, color: row.color } };
}

export async function deleteSizeType(id: number) {
  await requireSession();
  await prisma.sizeType.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function deletePartType(id: number) {
  await requireSession();
  await prisma.partType.delete({ where: { id } });
  revalidatePath("/settings");
}
