"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  createSession,
  destroySession,
  requireSession,
} from "@/lib/auth";
import { redirect } from "next/navigation";

export type LoginState = { error?: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !password) {
    return { error: "Nhập đầy đủ tài khoản và mật khẩu." };
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Tài khoản hoặc mật khẩu không đúng." };
  }

  await createSession({
    userId: user.id,
    username: user.username,
    name: user.name,
  });
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export type PasswordState = { error?: string; ok?: boolean };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const session = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");

  if (next.length < 6) {
    return { error: "Mật khẩu mới cần ít nhất 6 ký tự." };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });
  if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
    return { error: "Mật khẩu hiện tại không đúng." };
  }

  const passwordHash = await bcrypt.hash(next, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  return { ok: true };
}
