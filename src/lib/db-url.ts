/**
 * Build MySQL connection string từ 5 biến rời (DB_HOST, DB_PORT, ...).
 * Nếu DATABASE_URL đã được set thì ưu tiên dùng thẳng.
 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "3306";
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";
  const name = process.env.DB_NAME ?? "DataManager";

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  return `mysql://${auth}@${host}:${port}/${encodeURIComponent(name)}`;
}
