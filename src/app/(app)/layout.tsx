import { requireSession } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";
import Sidebar from "@/components/desktop/Sidebar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="min-h-dvh">
      <Sidebar userName={session.name} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <div className="mx-auto w-full max-w-md pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+5.5rem)] lg:max-w-[1600px] lg:pb-10">
          {children}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
