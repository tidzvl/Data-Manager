"use client";

import { usePathname } from "next/navigation";
import type { OrderNavItem } from "@/lib/aggregate";
import BottomNav from "@/components/BottomNav";
import Topbar from "@/components/desktop/Topbar";
import OrderRail from "@/components/desktop/OrderRail";

/**
 * Khung ngoài của app.
 *
 * Trang chủ trên desktop là bảng kính toàn màn — nó tự chứa mọi thứ (tìm kiếm,
 * cài đặt, tạo LSX) nên bỏ Topbar và OrderRail đi, và cho nội dung tràn viền.
 * Bản mobile của trang chủ và các route còn lại vẫn dùng khung cũ.
 */
export default function AppChrome({
  userName,
  orders,
  railCollapsed,
  children,
}: {
  userName?: string;
  orders: OrderNavItem[];
  railCollapsed: boolean;
  children: React.ReactNode;
}) {
  const home = usePathname() === "/";

  const inner = home
    ? "mx-auto w-full max-w-md pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+5.5rem)] lg:max-w-none lg:pb-0"
    : "mx-auto w-full max-w-md pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+5.5rem)] lg:max-w-[1700px] lg:pb-10";

  return (
    <div className="min-h-dvh">
      {/* Topbar và OrderRail vốn đã `hidden lg:*`, nên bỏ hẳn ở trang chủ
          không ảnh hưởng gì tới mobile. */}
      {!home && <Topbar userName={userName} />}

      <div className="lg:flex">
        {!home && <OrderRail orders={orders} initialCollapsed={railCollapsed} />}

        <div className="min-w-0 flex-1">
          <div className={inner}>{children}</div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
