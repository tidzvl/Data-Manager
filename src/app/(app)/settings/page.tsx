import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { listSizeTypes, listPartTypes } from "@/app/actions/types";
import ThemeToggle from "@/components/theme/ThemeToggle";
import LinesManager from "./LinesManager";
import CatalogManager from "./CatalogManager";
import ChangePassword from "./ChangePassword";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [session, linesRaw, sizeTypes, partTypes] = await Promise.all([
    getSession(),
    prisma.sewingLine.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { orders: true } } },
    }),
    listSizeTypes(),
    listPartTypes(),
  ]);

  const lines = linesRaw.map((l) => ({
    id: l.id,
    name: l.name,
    used: l._count.orders,
  }));

  return (
    <main className="px-4 pt-safe lg:px-8 lg:pt-6">
      <header className="sticky top-0 z-20 -mx-4 mb-3 border-b border-line bg-paper/80 px-4 pb-3 pt-3 backdrop-blur-xl lg:static lg:mx-0 lg:mb-5 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">
          Cài đặt
        </h1>
        <p className="text-sm text-muted">
          Đăng nhập: {session?.name} ({session?.username})
        </p>
      </header>

      <div className="space-y-4 pb-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Giao diện</h2>
          <ThemeToggle />
          <p className="mt-2 text-xs text-muted">
            Tông sáng theo phong cách ánh nắng · tông tối kiểu bảng điều khiển.
          </p>
        </section>

        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Chuyền may</h2>
          <LinesManager lines={lines} />
        </section>

        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 lg:row-span-2">
          <h2 className="mb-1 font-semibold">Danh mục dùng chung</h2>
          <p className="mb-3 text-xs text-muted">
            Dùng để chọn nhanh khi tạo LSX.
          </p>
          <CatalogManager sizeTypes={sizeTypes} partTypes={partTypes} />
        </section>

        <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Đổi mật khẩu</h2>
          <ChangePassword />
        </section>

        <form action={logoutAction} className="lg:hidden">
          <button
            type="submit"
            className="tap w-full rounded-xl border border-line bg-surface font-medium text-short active:bg-surface-2"
          >
            Đăng xuất
          </button>
        </form>
      </div>
    </main>
  );
}
