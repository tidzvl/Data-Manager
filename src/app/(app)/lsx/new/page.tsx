import { prisma } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import { listSizeTypes, listPartTypes } from "@/app/actions/types";
import OrderForm from "../OrderForm";

export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const [lines, sizeTypes, partTypes] = await Promise.all([
    prisma.sewingLine.findMany({ orderBy: { name: "asc" } }),
    listSizeTypes(),
    listPartTypes(),
  ]);

  return (
    <main className="px-4 lg:mx-auto lg:max-w-4xl lg:px-8 lg:py-6">
      <PageHeader title="Tạo LSX" back="/" />
      <OrderForm
        lines={lines.map((l) => ({ id: l.id, name: l.name }))}
        sizeTypes={sizeTypes}
        partTypes={partTypes}
        initial={{
          code: "",
          productName: "",
          lineId: null,
          note: "",
          status: "ACTIVE",
          categories: [],
        }}
      />
    </main>
  );
}
