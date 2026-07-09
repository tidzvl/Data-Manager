# Quản lý LSX (Data-Manager)

Ứng dụng web mobile-first quản lý **Lệnh Sản Xuất (LSX)** cho xưởng may: theo dõi
chi tiết xuất về chuyền may, hàng thêu (gửi đi/nhận về), và thành phẩm chuyền
gửi lên — mọi con số "đã gửi / còn thiếu / gửi ngày nào" tính tự động từ các phiếu.

## Công nghệ
- Next.js 15 (App Router, TypeScript) + Tailwind CSS v4
- Prisma + MySQL
- Auth: session cookie ký JWT (jose), 1 tài khoản quản lý
- PWA (thêm vào màn hình chính), Docker standalone

## Chạy local
1. Tạo `.env` từ mẫu và điền thông tin MySQL đã deploy sẵn:
   ```bash
   cp .env.example .env
   # sửa DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME=DataManager
   # đổi AUTH_SECRET thành chuỗi ngẫu nhiên dài
   ```
   > `DATABASE_URL` được tự dựng từ 5 biến `DB_*` (xem `scripts/with-db-url.mjs`),
   > không cần khai báo riêng. Có thể set `DATABASE_URL` để override.
2. Cài đặt và khởi tạo DB:
   ```bash
   npm install
   npm run db:push     # tạo bảng trong DB DataManager
   npm run db:seed     # tạo tài khoản admin + LSX-001 mẫu
   ```
3. Chạy dev:
   ```bash
   npm run dev         # http://localhost:3000
   ```
   Đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env` (mặc định admin / admin123).

## Deploy bằng pm2
```bash
npm ci
cp .env.example .env         # điền DB_* + AUTH_SECRET
npm run db:push && npm run db:seed   # chỉ lần đầu
npm run build                # postbuild tự copy static + public vào standalone
pm2 start ecosystem.config.cjs && pm2 save
```
> **Truy cập qua HTTP thuần** (VD `http://ip:2610`, không có HTTPS): cookie phiên
> mang cờ `Secure` nên trình duyệt không lưu, đăng nhập xong sẽ bị đá về trang
> login. Đặt `COOKIE_SECURE=false` trong `.env`, hoặc tốt hơn là dựng HTTPS.

## Deploy bằng Docker
MySQL chạy sẵn bên ngoài; container chỉ chứa Next.js.
```bash
# .env đã điền DB_* + AUTH_SECRET
docker compose up --build -d
# lần đầu: đẩy schema + seed (chạy 1 lần, từ máy có Node)
npm run db:push && npm run db:seed
```

## Mô hình dữ liệu (tóm tắt)
- `SewingLine` (chuyền may) 1—n `ProductionOrder`: **mỗi LSX do đúng 1 chuyền phụ trách**, 1 chuyền có thể nhận nhiều LSX.
- `ProductionOrder` (LSX) → `Category` (Áo/Quần) → `OrderSize` (size + SL thành phẩm kế hoạch) & `Part` (chi tiết, có màu).
- `PartTarget`: SL chi tiết cần gửi theo từng size.
- `SizeType` / `PartType`: danh mục dùng chung để chọn nhanh khi tạo LSX; thêm loại mới sẽ tự lưu vào danh mục. Mỗi `PartType` có 1 màu để phân biệt.
- Không lưu tổng "đã gửi" — mọi số liệu derive từ Movement (xem `src/lib/aggregate.ts`).

## Luồng sản xuất
```
1. SEW_OUT  Xuất chi tiết → chuyền may     (ghi theo chi tiết × size)
2. SEW_IN   Chuyền gửi hàng "đã may" lên   (ghi theo size)
3. EMB_OUT  Gửi hàng đã may đi thêu        (ghi theo size)
4. EMB_IN   Nhận hàng thêu về              (ghi theo size)
```
Thêu nằm **sau** công đoạn may và thao tác trên **hàng đã may**, không phải trên chi tiết.
Trần của từng bước, dùng cho nút "Điền hết số còn thiếu":

| Phiếu | Còn có thể nhập |
|---|---|
| `SEW_OUT` | SL chi tiết cần xuất − đã xuất |
| `SEW_IN` | SL kế hoạch − đã may |
| `EMB_OUT` | đã may − đã gửi thêu |
| `EMB_IN` | đã gửi thêu − đã nhận về |

## Hai giao diện
Cùng một nguồn dữ liệu, hai bố cục render song song (`lg:hidden` / `hidden lg:block`)
thay vì kéo giãn layout mobile:

- **Mobile** (< 1024px): bottom nav, FAB, card, accordion — tối ưu một tay.
- **Desktop** (≥ 1024px): sidebar cố định, **data table** (sắp xếp theo cột, hàng bung
  chi tiết), và **cây cấu trúc LSX** (LSX → phân loại → kích thước / chi tiết) hiển thị
  tiến độ ở từng nhánh. Trang LSX chia 2 cột: cây bên trái, bảng dữ liệu bên phải.

## Cấu trúc chính
- `src/lib/aggregate.ts` — tầng tính toán đã gửi/thiếu/đang ở thêu (mọi màn hình đọc từ đây).
- `src/app/(app)/lsx/[id]/` — trang hub LSX 4 tab (Tổng quan / Chi tiết / Thành phẩm / Lịch sử).
- `src/app/(app)/lsx/[id]/movement/` — form tạo/sửa phiếu (nút "Điền hết số còn thiếu" để bù hàng).
- `src/app/actions/` — server actions (orders, movements, lines, auth).
