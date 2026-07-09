import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getOrderDetail } from "@/lib/aggregate";
import PageHeader from "@/components/PageHeader";
import MovementForm from "../MovementForm";

export const dynamic = "force-dynamic";

export default async function EditMovementPage({
  params,
}: {
  params: Promise<{ id: string; mid: string }>;
}) {
  const { id, mid } = await params;
  const orderId = Number(id);
  const movementId = Number(mid);

  const [detail, movement] = await Promise.all([
    getOrderDetail(orderId),
    prisma.movement.findUnique({
      where: { id: movementId },
      include: { items: true },
    }),
  ]);
  if (!detail || !movement || movement.orderId !== orderId) notFound();

  const qty: Record<string, number> = {};
  for (const it of movement.items) {
    qty[`${it.partId ?? 0}:${it.orderSizeId}`] = it.quantity;
  }

  return (
    <main className="px-4 lg:mx-auto lg:max-w-4xl lg:px-8 lg:py-6">
      <PageHeader title="Sửa phiếu" back={`/lsx/${orderId}?tab=history`} />
      <MovementForm
        detail={detail}
        initial={{
          id: movement.id,
          type: movement.type,
          date: movement.date.toISOString().slice(0, 10),
          note: movement.note ?? "",
          qty,
        }}
      />
    </main>
  );
}
