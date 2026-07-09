import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Danh mục kích thước mặc định */
const SIZES = [
  "1/XXS",
  "3/XS",
  "S/5",
  "M/7",
  "L/9",
  "XL/11",
  "2XL/13",
  "3XL/15",
];

/** Danh mục chi tiết mặc định — mỗi chi tiết 1 màu để dễ phân biệt */
const PARTS: [string, string][] = [
  ["Đô sau", "#ef4444"],
  ["Nẹp lai trước", "#f97316"],
  ["Nẹp lai sau", "#eab308"],
  ["Tay giữa trái", "#22c55e"],
  ["Tay giữa phải", "#14b8a6"],
  ["Tay trước", "#3b82f6"],
  ["Tay sau", "#8b5cf6"],
  ["Bo cổ ngoài", "#ec4899"],
  ["Bo cổ trong", "#f43f5e"],
  ["Nẹp tay", "#64748b"],
];

async function main() {
  // 1) Tài khoản admin
  const username = process.env.ADMIN_USERNAME ?? "admin";
  const password = process.env.ADMIN_PASSWORD ?? "admin123";
  const name = process.env.ADMIN_NAME ?? "Quản lý";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: { passwordHash, name },
    create: { username, passwordHash, name },
  });
  console.log(`✔ Admin: ${username} / ${password}`);

  // 2) Danh mục kích thước
  for (const [i, label] of SIZES.entries()) {
    await prisma.sizeType.upsert({
      where: { label },
      update: { position: i },
      create: { label, position: i },
    });
  }
  console.log(`✔ ${SIZES.length} kích thước`);

  // 3) Danh mục chi tiết
  for (const [i, [pname, color]] of PARTS.entries()) {
    await prisma.partType.upsert({
      where: { name: pname },
      update: { color, position: i },
      create: { name: pname, color, position: i },
    });
  }
  console.log(`✔ ${PARTS.length} chi tiết`);

  // 4) Chuyền may
  const luc = await prisma.sewingLine.upsert({
    where: { name: "Anh Lực" },
    update: {},
    create: { name: "Anh Lực" },
  });
  await prisma.sewingLine.upsert({
    where: { name: "Anh Trọng" },
    update: {},
    create: { name: "Anh Trọng" },
  });

  // 5) LSX mẫu — 1 chuyền phụ trách
  const existing = await prisma.productionOrder.findUnique({
    where: { code: "LSX-001" },
  });
  if (existing) {
    console.log("• LSX-001 đã tồn tại, bỏ qua tạo mẫu.");
    return;
  }

  const order = await prisma.productionOrder.create({
    data: {
      code: "LSX-001",
      productName: "Áo thun cổ tròn hè 2026",
      lineId: luc.id,
    },
  });

  const ao = await prisma.category.create({
    data: { orderId: order.id, name: "Áo", position: 0 },
  });

  const targets: Record<string, number> = {
    "S/5": 50,
    "M/7": 100,
    "L/9": 100,
    "XL/11": 60,
  };
  const sizes = [];
  let pos = 0;
  for (const [label, qty] of Object.entries(targets)) {
    sizes.push(
      await prisma.orderSize.create({
        data: {
          categoryId: ao.id,
          sizeLabel: label,
          targetQty: qty,
          position: pos++,
        },
      })
    );
  }

  // Vài chi tiết lấy từ danh mục
  const chosen = ["Đô sau", "Bo cổ ngoài", "Tay trước", "Tay sau"];
  let ppos = 0;
  for (const pname of chosen) {
    const type = await prisma.partType.findUnique({ where: { name: pname } });
    const part = await prisma.part.create({
      data: {
        categoryId: ao.id,
        name: pname,
        color: type?.color,
        position: ppos++,
      },
    });
    for (const s of sizes) {
      await prisma.partTarget.create({
        data: { partId: part.id, orderSizeId: s.id, targetQty: s.targetQty },
      });
    }
  }

  console.log("✔ Đã tạo LSX-001 (chuyền Anh Lực).");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
