import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="nums text-5xl font-bold text-brand">404</p>
      <p className="mt-2 text-muted">Không tìm thấy trang này.</p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-fg"
      >
        Về danh sách LSX
      </Link>
    </main>
  );
}
