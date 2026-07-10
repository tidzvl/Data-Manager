# Handoff: Danh sách Lệnh sản xuất — Glassmorphism Dashboard

## Overview
Một màn hình duy nhất: bảng quản lý **Lệnh sản xuất (LSX)** trong ngành may mặc, hiển thị trên một **khối kính mờ (frosted glass)** đặt trên nền ảnh PNG có thể thay đổi. Bảng cho phép lọc, phân trang, và **mở rộng từng LSX** để xem/nhập chi tiết theo từng "Mục" công đoạn (gửi/nhận may, gửi/nhận thêu). Có một popover cài đặt (nút bánh răng) để tinh chỉnh nền và hiệu ứng kính.

## About the Design Files
Các file trong gói này là **bản thiết kế tham chiếu dựng bằng HTML** — prototype thể hiện *giao diện và hành vi mong muốn*, KHÔNG phải code production để copy nguyên si. Nhiệm vụ là **tái dựng lại thiết kế này trong codebase FE hiện có** (React/Vue/… tùy dự án), dùng đúng component library, design tokens, và convention sẵn có của dự án. Nếu dự án chưa có môi trường, hãy chọn framework phù hợp nhất rồi triển khai.

File `Glass Dashboard.dc.html` được viết bằng một runtime nội bộ (thẻ `<sc-for>`, `<sc-if>`, `<x-import>`, class `Component extends DCLogic`). **Không port runtime này** — chỉ đọc nó như đặc tả về layout/state/hành vi, rồi viết lại bằng React/Vue thường.

## Fidelity
**High-fidelity (hifi).** Màu sắc, khoảng cách, typography, và tương tác là bản cuối. Hãy tái dựng pixel-perfect bằng thư viện/pattern sẵn có của codebase. Dữ liệu trong bảng là **dữ liệu mẫu** (mock) — thay bằng data thật; cấu trúc cột và cách mở rộng thì giữ nguyên.

---

## Screens / Views

### Màn hình: Danh sách Lệnh sản xuất (một trang duy nhất)

**Purpose:** Người dùng xem danh sách LSX, lọc theo tên/ngày/mục, đổi số dòng hiển thị, mở rộng một LSX để xem chi tiết bán thành phẩm hoặc lịch sử nhận/gửi, và nhập thêm dòng mới.

**Layout tổng thể (3 lớp chồng lên nhau):**
1. **Nền (z-index 0):** ảnh PNG full-màn (`background-size: cover; center`). Mặc định là gradient hồng→tím→xanh (`assets/bg-default.png`). Người dùng có thể (a) kéo-thả 1 file ảnh lên vùng nền, hoặc (b) tải ảnh qua popover cài đặt.
   - Lớp phủ "làm tối nền": `rgba(0,0,0,α)` với α = 0–0.7 (mặc định 0).
2. **Khối kính (z-index 1):** panel trung tâm chứa toàn bộ nội dung.
3. **Popover cài đặt (z-index 20):** hiện khi bấm nút bánh răng.

**Khối kính (glass panel) — container chính:**
- Kích thước **cố định**: `width: min(1280px, calc(100vw - 96px))`, `height: min(820px, calc(100vh - 96px))`. Căn giữa viewport, wrapper ngoài `padding: 48px` (tạo margin với mép màn hình).
- `border-radius: 24px`
- `background: rgba(38,28,64, 0.42)` (tint tím than, opacity điều chỉnh được)
- `backdrop-filter: blur(22px) saturate(140%)` (blur điều chỉnh được 0–50px)
- `border: 1px solid rgba(255,255,255,0.14)`
- `box-shadow: 0 30px 80px rgba(20,10,50,0.45), inset 0 1px 0 rgba(255,255,255,0.12)`
- `padding: 26px 30px`, `display: flex; flex-direction: column; overflow: hidden`
- Cấu trúc dọc: **thanh filter (cố định, flex-shrink:0)** trên cùng → **vùng bảng cuộn (flex:1; overflow:auto)** bên dưới.

**Thanh filter (hàng trên cùng, flex, gap 14px, flex-wrap):**
- Tiêu đề **"Danh sách Lệnh sản xuất"** — 22px, weight 600, `color:#fff`, `letter-spacing:-0.3px`, `margin-right:auto` (đẩy các control sang phải).
- **Ô search:** width `min(260px,100%)`, `bg rgba(255,255,255,0.08)`, `border 1px rgba(255,255,255,0.12)`, `border-radius:12px`, `padding:9px 13px`. Có icon tròn + input placeholder "Tìm LSX, sản phẩm...". Text input màu trắng.
- **Lọc theo ngày:** `<input type="date">` cùng style nền/bo góc; `color-scheme: dark`.
- **Lọc theo Mục:** `<select>` — options: *Tất cả mục / Gửi may / Nhận may / Gửi thêu / Nhận thêu*.
- **Số dòng:** `<select>` — options: *10 / 20 / 50 dòng* (mặc định **20**).
- **Nút bánh răng ⚙:** 40×40, `border-radius:12px`, cùng style nền. Mở popover cài đặt.
- (Tất cả select: nền `rgba(255,255,255,0.08)`, border `rgba(255,255,255,0.12)`, radius 12px, padding `9px 12px`, text trắng 13px; `<option>` đặt `color:#2a1d4a` để đọc được trên nền trắng của menu.)

---

## Bảng dữ liệu (data table)

Vùng cuộn ngang khi hẹp: wrapper `overflow-x:auto` + inner `min-width:1250px`.

**Cột (grid-template-columns dùng CHUNG cho header, dòng cha, dòng con — phải trùng khớp để canh cột):**
```
28px  minmax(150px,1.4fr)  96px  104px  78px  repeat(9, 46px)  60px  minmax(120px,1fr)  52px
```
| # | Cột | Nội dung |
|---|-----|----------|
| 1 | (caret) | Mũi tên ▶ mở rộng, xoay 90° khi mở |
| 2 | **LSX** | Mã LSX (15px, weight 600, #fff) + tên sản phẩm nhỏ bên dưới (12px, `rgba(255,255,255,0.5)`) |
| 3 | **Chuyền may** | vd "Chuyền 1" (`rgba(255,255,255,0.75)`) |
| 4 | **Mục** | text cố định: Gửi may / Nhận may / Gửi thêu / Nhận thêu |
| 5 | **Phân loại** | text thường: Áo / Quần / Váy (không badge màu) |
| 6–14 | **9 cột size** | thứ tự: `1/XXS, 3/XS, S/5, M/7, L/9, XL/11, 2XL/13, 3XL/15, 4XL`. Căn giữa. Giá trị 0 hiển thị "—" màu mờ `rgba(255,255,255,0.25)`, giá trị >0 màu `rgba(255,255,255,0.85)` |
| 15 | **Tổng** | tổng 9 size, weight 700, #fff, căn giữa |
| 16 | **Note** | ghi chú (12px, `rgba(255,255,255,0.55)`) |
| 17 | **(Sửa)** | nút ✎ 32×32, `border-radius:9px`, `bg rgba(255,255,255,0.1)`, border `rgba(255,255,255,0.14)` |

**Header bảng:** cùng grid, `font-size:14px`, `font-weight:500`, `color:rgba(255,255,255,0.92)` (chữ trắng, to hơn body), `border-bottom:1px solid rgba(255,255,255,0.14)`, `align-items:end`. **Nền trong suốt** — đồng bộ với các dòng bên dưới, KHÔNG có dải nền riêng. (Các nhãn cột size vẫn giữ nhỏ `font-size:11px`.)

**Dòng cha (mỗi LSX):** cùng grid, `padding:13px 0`, `font-size:14px`, `border-bottom:1px solid rgba(255,255,255,0.05)`, `align-items:center`, **`cursor:pointer`** — click cả dòng để mở/đóng. Nút ✎ phải `stopPropagation` để không toggle khi bấm sửa.

### Mở rộng dòng con (khi click 1 LSX)
Khối con hiện ngay dưới dòng cha: `background:rgba(255,255,255,0.04)`, `border:1px solid rgba(255,255,255,0.09)`, `border-radius:14px`, `margin:4px 0 12px`, `padding:6px 6px 10px`. Nội dung **tùy theo Mục**:

- **Mục = "Gửi may"** → tiêu đề "Chi tiết bán thành phẩm". Các dòng con là **bán thành phẩm** (vd *Đô sau, Tay trước, Tay sau, Bo cổ ngoài, Bo cổ trong, Nẹp áo, Thân trước, Thân sau*), mỗi dòng có số lượng theo từng cột size. **Tổng số lượng các dòng con theo mỗi size = số ở cột size của dòng cha.** Cột meta ghi "Định mức".
- **Mục = "Nhận may" / "Gửi thêu" / "Nhận thêu"** → tiêu đề "Lịch sử &lt;mục&gt;". Các dòng con là **lịch sử theo đợt** ("Đã nhận đợt 1/2/3" hoặc "Đã gửi đợt …"), mỗi đợt có số lượng theo size, và cột meta ghi **ngày** (vd "Ngày 02/07").

**Dòng con:** nhãn nằm ở cột span 4 (LSX→Phân loại), `padding-left:28px` để thụt vào; 9 cột size; cột Tổng (weight 600, #fff); cột meta span 2 (12px, `rgba(255,255,255,0.5)`). Mỗi dòng con `border-top:1px solid rgba(255,255,255,0.05)`.

**Dòng trống để thêm dữ liệu:** cuối mỗi khối con, một hàng với `border-top:1px dashed rgba(255,255,255,0.12)`: dấu **+** (tím nhạt), input "Thêm dòng mới..." (span 4), 9 input số (`inputmode=numeric`, căn giữa), cột Tổng "—", input "Ghi chú" (span 2). Tất cả input nền `rgba(255,255,255,0.05)`, `border:1px dashed rgba(255,255,255,0.15~0.18)`, bo góc 7–8px, chữ trắng. (Hiện chỉ là UI nhập — nối logic thêm dòng thật trong codebase.)

---

## Popover cài đặt (nút bánh răng ⚙)
Card kính nổi: `position:absolute; top:78px; right:30px; z-index:20; width:288px`, `background:rgba(28,20,48,0.97)`, `backdrop-filter:blur(24px)`, `border:1px solid rgba(255,255,255,0.14)`, `border-radius:16px`, `box-shadow:0 24px 60px rgba(0,0,0,0.5)`, `padding:18px 18px 20px`, chữ trắng.
- Header: "Tùy chỉnh giao diện" (15px/600) + nút "Đặt lại".
- **Nền:** nút "⬆ Tải ảnh nền (PNG)" (label bọc `<input type=file>` ẩn; đọc file → dataURL → đặt làm background) + slider "Làm tối nền" (0–0.7, step 0.02).
- **Khối kính:** slider "Độ mờ" (0–50px, step 1), slider "Độ trong" (0–0.9, step 0.02), và 4 ô "Tông màu kính" (38,28,64 / 20,20,30 / 30,40,70 / 60,30,55 — dạng RGB triple), ô đang chọn viền trắng.
- Sliders: `accent-color:#c6b5ff`.

---

## Interactions & Behavior
- **Click dòng LSX:** toggle mở/đóng khối con của dòng đó (state theo index).
- **Nút ✎:** `stopPropagation` (chưa nối hành động — mở modal sửa trong codebase).
- **Đổi "Số dòng":** cắt danh sách còn N dòng (10/20/50); reset trạng thái mở rộng.
- **Nút ⚙:** toggle popover cài đặt.
- **Tải ảnh nền / kéo-thả PNG:** đổi ảnh nền tức thì.
- **Sliders/swatches popover:** áp dụng blur / opacity / tint / độ tối nền lên khối kính & nền ngay lập tức.
- **Đặt lại:** xoá override về mặc định.
- Caret xoay `transform: rotate(0→90deg)`, `transition: transform .15s`.

## State Management
- `expanded: { [rowIndex]: boolean }` — LSX nào đang mở.
- `pageSize: '10' | '20' | '50'` (mặc định '20') — số dòng.
- Cài đặt giao diện (đều có thể null = dùng mặc định): `blur` (px), `opacity` (0–0.9), `tint` (RGB triple string), `scrim` (0–0.7 độ tối nền), `bgUrl` (dataURL ảnh tải lên), `open` (popover).
- Data fetching: thay mock bằng API danh sách LSX; mỗi LSX cần kèm `muc`, mảng `sizes[9]`, và children (bán thành phẩm hoặc lịch sử) tuỳ `muc`.

## Design Tokens
**Màu:**
- Text chính `#ffffff`; phụ `rgba(255,255,255,0.75)` / `0.55` / `0.5` / `0.45`; mờ (size = 0) `rgba(255,255,255,0.25)`.
- Nền khối kính (tint) `rgba(38,28,64, .42)`; các lựa chọn tint: `rgb(38,28,64)`, `rgb(20,20,30)`, `rgb(30,40,70)`, `rgb(60,30,55)`.
- Bề mặt phụ / card con: `rgba(255,255,255,0.04–0.09)`.
- Đường viền: `rgba(255,255,255,0.05 / 0.09 / 0.12 / 0.14)`.
- Nhấn (accent, dùng cho slider & dấu +): `#c6b5ff` / `rgba(198,181,255,0.8)`.
- Option trên menu trắng: `#2a1d4a`.
- Nền gradient mặc định: hồng `#f7c9d8` → `#c9a8e0` → `#7b8be8` → xanh `#2f52e0` (chéo), có 2 vệt sáng radial (hồng góc trên-trái, xanh góc dưới-phải).

**Bo góc:** 7–8px (input nhỏ), 9–10px (nút/ô), 12px (control filter), 14px (card con), 16px (popover), 24px (panel chính).
**Blur:** panel 22px (điều chỉnh 0–50); popover 24px; header 12px (đã bỏ, header trong suốt).
**Typography:** font **Poppins** (400/500/600/700), fallback `system-ui, sans-serif`. Tiêu đề 22px/600; header bảng 14px/500; body 13–15px; nhãn size 11px; caption 11–12px.
**Shadow:** panel `0 30px 80px rgba(20,10,50,.45)` + inset top highlight; popover `0 24px 60px rgba(0,0,0,.5)`.
**Spacing:** panel padding `26px 30px`; gap cột grid `8px`; gap filter `14px`; wrapper padding `48px`.

## Assets
- `assets/bg-default.png` — gradient nền mặc định (1600×1200). Có thể thay bằng bất kỳ ảnh nào của dự án.
- Font **Poppins** từ Google Fonts.
- Không dùng SVG icon riêng — caret/dấu +/✎/⚙ dùng ký tự Unicode; trong codebase nên thay bằng icon set sẵn có (vd chevron, pencil, settings, plus).
- Không có logo/brand asset độc quyền.

## Files
- `Glass Dashboard.dc.html` — prototype đầy đủ (template + logic). Đọc để lấy layout, style inline chính xác, và logic sinh dữ liệu con (`splitInto` đảm bảo tổng dòng con = dòng cha).
- `image-slot.js` — web component cho vùng kéo-thả ảnh nền (tham chiếu hành vi; trong codebase dùng cơ chế upload sẵn có).
- `assets/bg-default.png` — ảnh nền mặc định.
