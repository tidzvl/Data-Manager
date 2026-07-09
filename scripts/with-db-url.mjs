#!/usr/bin/env node
// Load .env (+ .env.local), tự build DATABASE_URL từ DB_* nếu chưa có,
// rồi spawn lệnh phía sau (prisma / tsx ...). Không cần thư viện ngoài.
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

if (!process.env.DATABASE_URL) {
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "3306";
  const user = process.env.DB_USER ?? "root";
  const password = process.env.DB_PASSWORD ?? "";
  const name = process.env.DB_NAME ?? "DataManager";
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  process.env.DATABASE_URL = `mysql://${auth}@${host}:${port}/${encodeURIComponent(name)}`;
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Usage: node scripts/with-db-url.mjs <command> [...args]");
  process.exit(1);
}

const child = spawn(cmd, args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
