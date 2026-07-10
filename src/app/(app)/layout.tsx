import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth";
import { getOrderNavList } from "@/lib/aggregate";
import AppChrome from "@/components/AppChrome";

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
    <AppChrome
      userName={session.name}
      orders={orders}
      railCollapsed={collapsed}
    >
      {children}
    </AppChrome>
  );
}
