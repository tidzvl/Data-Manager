import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getOrderDetail } from "@/lib/aggregate";
import PageHeader from "@/components/PageHeader";
import { listSizeTypes, listPartTypes } from "@/app/actions/types";
import OrderForm from "../../OrderForm";

export const dynamic = "force-dynamic";

export default async function EditOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = Number(id);
  const [detail, lines, sizeTypes, partTypes] = await Promise.all([
    getOrderDetail(orderId),
    prisma.sewingLine.findMany({ orderBy: { name: "asc" } }),
    listSizeTypes(),
    listPartTypes(),
  ]);
  if (!detail) notFound();

  return (
    <main className="px-4 lg:mx-auto lg:max-w-4xl lg:px-8 lg:py-6">
      <PageHeader title={`Sửa ${detail.code}`} back={`/lsx/${orderId}`} />
      <OrderForm
        lines={lines.map((l) => ({ id: l.id, name: l.name }))}
        sizeTypes={sizeTypes}
        partTypes={partTypes}
        initial={{
          id: detail.id,
          code: detail.code,
          productName: detail.productName,
          lineId: detail.lineId,
          note: detail.note ?? "",
          status: detail.status,
          categories: detail.categories.map((c) => ({
            id: c.id,
            name: c.name,
            sizes: c.sizes.map((s) => ({
              id: s.id,
              sizeLabel: s.sizeLabel,
              targetQty: s.targetQty,
            })),
            parts: c.parts.map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              targets: c.sizes.map((s) => p.targets[s.id] ?? 0),
            })),
          })),
        }}
      />
    </main>
  );
}
