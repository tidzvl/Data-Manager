import { notFound } from "next/navigation";
import { getOrderDetail } from "@/lib/aggregate";
import type { MovementType } from "@prisma/client";
import PageHeader from "@/components/PageHeader";
import MovementForm from "../MovementForm";

export const dynamic = "force-dynamic";

const VALID: MovementType[] = ["SEW_OUT", "SEW_IN", "EMB_OUT", "EMB_IN"];

export default async function NewMovementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const orderId = Number(id);
  const t = (
    VALID.includes(type as MovementType) ? type : "SEW_OUT"
  ) as MovementType;

  const detail = await getOrderDetail(orderId);
  if (!detail) notFound();

  return (
    <main className="px-4">
      <PageHeader title="Tạo phiếu" back={`/lsx/${orderId}?tab=history`} />
      <MovementForm
        detail={detail}
        initial={{ type: t, date: "", note: "", qty: {} }}
      />
    </main>
  );
}
