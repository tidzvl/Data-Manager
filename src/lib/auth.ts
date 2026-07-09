import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "dm_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 ngày

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET chưa được cấu hình");
  return new TextEncoder().encode(secret);
}

/**
 * Cookie có cờ Secure thì trình duyệt chỉ gửi qua HTTPS. Chạy production sau
 * HTTPS thì để mặc định. Nếu buộc phải phục vụ qua HTTP thuần (VD: truy cập
 * thẳng http://ip:port trong mạng nội bộ), đặt COOKIE_SECURE=false — không có
 * nó thì đăng nhập xong cookie bị trình duyệt bỏ, và bị đá về trang login.
 */
function useSecureCookie(): boolean {
  const v = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return process.env.NODE_ENV === "production";
}

export type SessionPayload = {
  userId: number;
  username: string;
  name: string;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: useSecureCookie(),
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      userId: payload.userId as number,
      username: payload.username as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

/** Dùng trong Server Component / action: bắt buộc đăng nhập, nếu không thì redirect. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export { COOKIE_NAME };
