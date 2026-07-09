/**
 * Cấu hình pm2 cho bản build standalone của Next.js.
 *
 * Hai điều quan trọng:
 * 1. `.next/standalone/server.js` KHÔNG tự đọc file .env, nên phải nạp ở đây.
 * 2. App tự dựng DATABASE_URL từ 5 biến DB_* (xem src/lib/db-url.ts), nên chỉ
 *    cần truyền DB_* + AUTH_SECRET là đủ.
 *
 *   pm2 start ecosystem.config.cjs
 */
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");

function loadEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
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
    out[key] = val;
  }
  return out;
}

const root = __dirname;
const fileEnv = {
  ...loadEnvFile(resolve(root, ".env")),
  ...loadEnvFile(resolve(root, ".env.local")),
};

const required = ["DB_HOST", "DB_USER", "DB_NAME", "AUTH_SECRET"];
const missing = required.filter((k) => !fileEnv[k] && !process.env[k]);
if (missing.length) {
  throw new Error(
    `Thiếu biến môi trường trong .env: ${missing.join(", ")}. ` +
      `Copy .env.example thành .env rồi điền.`
  );
}

module.exports = {
  apps: [
    {
      name: "data-manager",
      cwd: root,
      script: ".next/standalone/server.js",
      exec_mode: "fork", // Next standalone tự nghe cổng, không dùng cluster
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        ...fileEnv,
        NODE_ENV: "production",
        PORT: fileEnv.PORT || process.env.PORT || "3000",
        HOSTNAME: fileEnv.HOSTNAME || "0.0.0.0",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      out_file: "logs/out.log",
      error_file: "logs/err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
