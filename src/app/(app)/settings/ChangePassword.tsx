"use client";

import { useActionState } from "react";
import {
  changePasswordAction,
  type PasswordState,
} from "@/app/actions/auth";

const initial: PasswordState = {};

export default function ChangePassword() {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    initial
  );

  return (
    <form action={action} className="space-y-3">
      <input
        name="current"
        type="password"
        autoComplete="current-password"
        placeholder="Mật khẩu hiện tại"
        className="tap w-full rounded-xl border border-line px-3 outline-none focus:border-brand"
      />
      <input
        name="next"
        type="password"
        autoComplete="new-password"
        placeholder="Mật khẩu mới (≥ 6 ký tự)"
        className="tap w-full rounded-xl border border-line px-3 outline-none focus:border-brand"
      />
      {state.error && (
        <p className="rounded-lg bg-short-soft px-3 py-2 text-sm text-short">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          Đã đổi mật khẩu.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="tap w-full rounded-xl bg-brand font-semibold text-brand-fg disabled:opacity-60"
      >
        {pending ? "Đang lưu…" : "Đổi mật khẩu"}
      </button>
    </form>
  );
}
