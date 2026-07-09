import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth";
import { getOrderNavList } from "@/lib/aggregate";
import BottomNav from "@/components/BottomNav";
import Topbar from "@/components/desktop/Topbar";
import OrderRail from "@/components/desktop/OrderRail";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, orders, store] = await Promise.all([
    requireSession(),
    getOrderNavList(),
    cookies(),
  ]);

  // Đọc ở server để rail render đúng trạng thái ngay lần vẽ đầu
  const collapsed = store.get("dm-rail")?.value === "1";

  return (
    <div className="min-h-dvh">
      <Topbar userName={session.name} />

      <div className="lg:flex">
        <OrderRail orders={orders} initialCollapsed={collapsed} />

        <div className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-md pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+5.5rem)] lg:max-w-[1700px] lg:pb-10">
            {children}
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
