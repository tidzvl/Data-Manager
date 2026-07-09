"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/app/actions/auth";

const initial: LoginState = {};

export default function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="username" className="mb-1.5 block text-sm font-medium">
          Tài khoản
        </label>
        <input
          id="username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          className="tap w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-brand"
          placeholder="admin"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
          Mật khẩu
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="tap w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-brand"
          placeholder="••••••••"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-short-soft px-3 py-2 text-sm text-short">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="tap w-full rounded-xl bg-brand px-4 text-base font-semibold text-brand-fg disabled:opacity-60"
      >
        {pending ? "Đang vào…" : "Đăng nhập"}
      </button>
    </form>
  );
}
