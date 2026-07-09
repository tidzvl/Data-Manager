import LoginForm from "./LoginForm";

export const metadata = { title: "Đăng nhập · Quản lý LSX" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 pt-safe pb-safe">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-brand-fg text-2xl font-bold">
            LSX
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Quản lý sản xuất</h1>
          <p className="mt-1 text-sm text-muted">
            Theo dõi chuyền may · hàng thêu · thành phẩm
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
