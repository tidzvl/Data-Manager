import { requireSession } from "@/lib/auth";
import BottomNav from "@/components/BottomNav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return (
    <div className="min-h-dvh">
      <div className="mx-auto w-full max-w-md pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+5.5rem)]">
        {children}
      </div>
      <BottomNav />
    </div>
  );
}
