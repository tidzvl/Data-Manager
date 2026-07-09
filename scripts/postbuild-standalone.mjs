#!/usr/bin/env node
// Next `output: "standalone"` không copy .next/static và public vào bundle.
// Thiếu chúng thì server chạy được nhưng mất toàn bộ CSS/JS/icon.
// Script này chạy tự động sau `npm run build` (npm lifecycle "postbuild").
import { cp, rm, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next/standalone");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(standalone))) {
  console.error(
    "✗ Không thấy .next/standalone — kiểm tra output: \"standalone\" trong next.config.ts"
  );
  process.exit(1);
}

const jobs = [
  { from: ".next/static", to: ".next/standalone/.next/static", label: "static" },
  { from: "public", to: ".next/standalone/public", label: "public" },
];

for (const { from, to, label } of jobs) {
  const src = resolve(root, from);
  if (!(await exists(src))) {
    console.warn(`• bỏ qua ${label} (không có ${from})`);
    continue;
  }
  const dest = resolve(root, to);
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
  console.log(`✔ copy ${from} → ${to}`);
}

console.log("✔ Standalone sẵn sàng: node .next/standalone/server.js");
