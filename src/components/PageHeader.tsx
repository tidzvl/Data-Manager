import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default function PageHeader({
  title,
  back = "/",
  right,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 -mx-4 mb-3 flex items-center gap-1 border-b border-line bg-paper/80 px-2 py-2 backdrop-blur-xl pt-safe">
      <Link
        href={back}
        aria-label="Quay lại"
        className="tap flex items-center justify-center rounded-lg text-ink active:bg-surface"
      >
        <ChevronLeft size={24} />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">
        {title}
      </h1>
      {right}
    </header>
  );
}
