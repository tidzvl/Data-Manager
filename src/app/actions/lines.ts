"use server";

import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type LineResult = {
  ok: boolean;
  error?: string;
  line?: { id: number; name: string };
};

export async function createLine(name: string): Promise<LineResult> {
  await requireSession();
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Nhập tên chuyền may." };
  const existing = await prisma.sewingLine.findUnique({
    where: { name: clean },
  });
  if (existing) return { ok: true, line: existing };
  const line = await prisma.sewingLine.create({ data: { name: clean } });
  revalidatePath("/settings");
  return { ok: true, line };
}

export async function renameLine(id: number, name: string) {
  await requireSession();
  await prisma.sewingLine.update({
    where: { id },
    data: { name: name.trim() },
  });
  revalidatePath("/settings");
}

export async function deleteLine(id: number): Promise<LineResult> {
  await requireSession();
  const used = await prisma.productionOrder.count({ where: { lineId: id } });
  if (used > 0) {
    return {
      ok: false,
      error: `Chuyền đang phụ trách ${used} LSX, không thể xoá.`,
    };
  }
  await prisma.sewingLine.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function listLines() {
  await requireSession();
  return prisma.sewingLine.findMany({ orderBy: { name: "asc" } });
}

/** Kèm số LSX đang dùng — LinesManager cần để chặn xoá chuyền còn hàng. */
export async function listLinesWithUsage() {
  await requireSession();
  const rows = await prisma.sewingLine.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { orders: true } } },
  });
  return rows.map((l) => ({ id: l.id, name: l.name, used: l._count.orders }));
}
