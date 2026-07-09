import { requireSession } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";
import Topbar from "@/components/desktop/Topbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="min-h-dvh">
      <Topbar userName={session.name} />

      <div className="mx-auto w-full max-w-md pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+5.5rem)] lg:max-w-[1800px] lg:pb-10">
        {children}
      </div>

      <BottomNav />
    </div>
  );
}
