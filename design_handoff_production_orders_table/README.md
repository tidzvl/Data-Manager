# Handoff: Bảng quản lý Lệnh sản xuất (Excel-style, 3 tầng)

## Overview
A single-page **data-management table** for garment/apparel production orders, styled to look and feel like a Microsoft-Excel spreadsheet (green table theme, gridlines, banded rows, sticky headers, horizontal size grid). It shows quantities broken down by garment size and lets the user drill down through three expandable tiers:

1. **Lệnh sản xuất (Production Order)** — order code + product name + planned quantity ("Số lượng dự kiến").
2. **Mục / Phân loại** — a receiving stage combined with garment type, shown as one label e.g. **"Nhận thêu (Áo)"**, **"Nhận thêu (Quần)"** + received-so-far quantity ("Số lượng đã nhận").
3. **Đợt (Batch)** — each receiving batch + quantity received in that batch ("Số lượng nhận của đợt").

Each tier expands/collapses independently via a chevron toggle on the leftmost (sticky) column. Totals roll up automatically from the bottom tier.

> UI language is Vietnamese. Keep the Vietnamese copy verbatim.

## About the Design Files
The file in this bundle (`Quản lý sản xuất.dc.html`) is a **design reference created in HTML** — a prototype demonstrating the intended look and behavior. It is **not production code to copy directly**. It uses an internal "Design Component" runtime (`<x-dc>`, `support.js`, `{{ }}` template holes, `renderVals()`), which is **not** part of your target stack — ignore that machinery.

Your task: **recreate this design in the target codebase's existing environment** (React, Vue, Angular, etc.), using its established component library, styling approach, and data layer. If no environment exists yet, pick the most appropriate framework and implement it there. A plain `<table>` with `position: sticky` cells, or the codebase's data-grid/tree-table component, are both fine — match the visual spec below.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, and interaction details below are final. Recreate the UI pixel-accurately using the codebase's own primitives. The sample data is illustrative — wire it to the real API.

## Screens / Views

### Screen: Danh sách Lệnh sản xuất (Production Order List)
Single full-page view. Outer page background `#dfe3e0`, padding `22px 26px 40px`. The content sits in a centered white card, `max-width: 1560px`, `border: 1px solid #b7beb8`, `border-radius: 4px`, `box-shadow: 0 10px 34px rgba(31,42,36,.16)`, `overflow: hidden`. The card has four stacked regions:

**1. Title bar**
- Background = accent green `#217346`, white text, padding `14px 18px`, flex row, `gap: 12px`.
- Left: a `26×26` rounded square icon (`background: rgba(255,255,255,.16)`, `border-radius: 4px`) with a `▦` glyph.
- Title text "Danh sách Lệnh sản xuất" — `17px`, weight `700`, `letter-spacing: .2px`.
- Right (margin-left auto): caption "Quản lý theo Lệnh · Mục · Đợt nhận" — `12px`, `opacity: .82`.

**2. Command bar**
- Background `#f2f5f1`, border-bottom `1px solid #cdd3cd`, padding `11px 16px`, flex row, `gap: 10px`, `flex-wrap: wrap`.
- Search input: `flex: 0 0 300px`, left-inset `⌕` icon (`#8a938c`), padding `7px 10px 7px 28px`, `border: 1px solid #b7beb8`, `border-radius: 4px`, font `13px`, placeholder "Tìm LSX, tên...", sample value "2607020".
- Date input: `width: 140px`, placeholder "mm/dd/yyyy"; on focus switches `type` to native date picker. Same border/radius/font as search.
- Two `<select>`s (same styling): options `["Nhận thêu","Nhận in","Tất cả"]` and `["50 LSX","100 LSX","200 LSX"]`.
- Right group (`margin-left: auto`, flex, `gap: 8px`):
  - "⭳ Xuất Excel" — white button, `border: 1px solid #b7beb8`.
  - "⇪ Nhập nhanh" — white button, same style.
  - "＋ Tạo LSX" — primary: `background: #217346` (accent), white text, weight `600`, `border: 1px solid #217346`.
  - Gear button "⚙" — `width: 34px`, white, `#5a635c` glyph.
  - All buttons: padding `7px 12–14px`, `border-radius: 4px`, `font-size: 13px`, `cursor: pointer`.

**3. Data grid** (the core)
- Scroll container: `overflow: auto`, `max-height: 76vh`, custom scrollbars (14px, thumb `#c1c7c2` with 3px `#eef1ee` border, track `#eef1ee`).
- `<table>`: `border-collapse: separate; border-spacing: 0; width: 100%; min-width: 1300px; font-size: 12.5px`. Gridlines are per-cell `border-right`/`border-bottom` (see tokens).
- **Header — two rows, sticky to top:**
  - Row 1 cells (all accent-green `#217346`, white, sticky `top: 0`):
    - Col A "Lệnh SX · Mục · Đợt" — `rowspan 2`, **sticky left: 0** (freezes horizontally), `width: 308px`, `z-index: 6`, right shadow `2px 0 0 rgba(31,42,36,.08)`.
    - Col B "Chuyền may" — `rowspan 2`, `width: 118px`.
    - "SỐ LƯỢNG THEO SIZE" — `colspan 11`, centered, background = **accentDim** `#2d8a56` (accent brightened ~1.18×), `letter-spacing: .4px`.
    - "Tổng" — `rowspan 2`, `width: 82px`, right-aligned, weight `700`.
    - "Ghi chú" — `rowspan 2`, `width: 150px`.
  - Row 2 cells: the 11 size-column labels, background accentDim `#2d8a56`, text `#eaf3e4`, `font-size: 11px`, weight `600`, centered, each `width: 56px`, sticky `top: 35px` (sits under row 1; use `31px` in compact mode).
  - Size columns (in order): `1/XXS, 3/XS, S/5, M/7, L/9, XL/11, 2XL/13, 3XL/15, 4XL, 5XL, 6XL` (internal keys `xxs, xs, s, m, l, xl, xxl, x3, x4, x5, x6`).
- **Body rows** — flattened tree; each visible node is one `<tr>`. Common structure per row:
  - Col A (**sticky left: 0**, `z-index: 2`, background matches the row bg, right shadow `2px 0 0 rgba(31,42,36,.05)`): a flex row `gap: 7px` containing:
    - An `18×18` chevron toggle button (`border: 1px solid #b7beb8`, `border-radius: 3px`, white, `#3f4a43` glyph, `9px`) showing `▸` collapsed / `▾` expanded — only when the node has children; otherwise an `18px` spacer keeps alignment. Batch/adder rows have no toggle.
    - A label block: main line (`font-weight`, `color`, `font-size` per tier below) + optional muted subtitle (`11px`, `#8a938c`, ellipsis, `max-width: 230px`).
    - **Indentation** is applied via `padding-left` on col A: tier 1 = `12px`, tier 2 = `34px`, tier 3 (batch) & adder = `58px`.
  - Col B "Chuyền may": `color: #54605a`, `white-space: nowrap` (holds the sewing line at tier 1; the batch date at tier 3; empty at tier 2).
  - 11 size cells: right-aligned, `font-variant-numeric: tabular-nums`. A present value shows the number; absent shows an en-dash "–" in `#c6ccc4`.
  - "Tổng" cell: right-aligned, weight `700`, colored per tier, with a tinted background per tier.
  - "Ghi chú" cell: `#8a938c`, `11px`, `white-space: nowrap`.
  - Cell padding = `8px 10px` (comfortable) or `5px 8px` (compact).

  **Per-tier styling:**
  | Tier | Row bg | Main label | Main type | Số cells color | Tổng color / bg | Ghi chú example |
  |---|---|---|---|---|---|---|
  | 1 · Order | `#ffffff` | order code e.g. `LSX2607020`, subtitle = product name | weight 700, `#1f2a24`, 13px | `#b45309` (orange = planned) | `#b45309` / `#fff7ed` | "Dự kiến · 12/07/2026" |
  | 2 · Mục(Loại) | `#eef5e9` (banded on) / `#f7faf5` (banded off) | e.g. `Nhận thêu (Áo)` | weight 600, `#2f3a34`, 12.5px | `#166534` (green = received) | `#166534` / `#e3f0da` | "Đã nhận · N đợt" or "Chưa nhận" |
  | 3 · Đợt | `#f6faf3` / `#fbfdfa` | e.g. `Đợt 1` | weight 500, `#54605a`, 12px | `#1f2937` (dark) | `#1f2a24` / transparent | (empty) |
  | Adder | same as tier 3 | `＋ Thêm đợt nhận…` | weight 400, `#9aa39c`, 12px | (empty cells) | — | (empty) |

  Under each expanded tier-2 node, after its batch rows, render one non-interactive **"＋ Thêm đợt nhận…"** adder row (affordance to add a new batch).

**4. Footer**
- Background `#f2f5f1`, border-top `1px solid #cdd3cd`, padding `9px 16px`, `font-size: 12px`, `color: #54605a`, flex row `gap: 14px`.
- "**N** lệnh sản xuất" · divider "|" (`#c1c7c2`) · "**M** dòng hiển thị" (M counts visible rows excluding adder rows) · right (margin-left auto): hint "Nhấp ▸ để xem Mục → Đợt nhận" (`#8a938c`).

## Interactions & Behavior
- **Expand/collapse:** clicking a row's chevron toggles that node. Order, Mục(Loại), and Batch-parent expansion states are independent. Collapsing a parent hides all descendants. Chevron flips `▸`→`▾`.
- **Number cells:** show the size quantity, or "–" when that size has no quantity.
- **Roll-up totals (compute, don't store):**
  - Tier 2 received quantity per size = sum of that classification's batch quantities per size; its "Tổng" = sum across sizes.
  - Tier 3 "Tổng" = sum across sizes of that batch.
  - Tier 1 "Tổng" = sum across sizes of the planned quantities.
- **Date field:** starts as a text input showing "mm/dd/yyyy"; on focus becomes a native date input.
- **Sticky behavior:** header stays on vertical scroll; col A stays on horizontal scroll (both pinned = intersection stays visible). Everything else scrolls under.
- Command-bar buttons (Xuất Excel, Nhập nhanh, Tạo LSX, gear) and the adder rows are **presentational stubs** in the prototype — wire them to real handlers (export, quick-import, create-order modal, settings, add-batch).
- No loading/error/empty states are designed yet — add per codebase conventions. A classification with zero batches renders with no chevron and note "Chưa nhận".

## State Management
- `openOrders: Record<orderId, boolean>` — expanded order nodes.
- `openClassifications: Record<classificationId, boolean>` — expanded tier-2 nodes (the prototype names these `openM`/`openL`; conceptually one flag per Mục-Loại row).
- Toggling sets the boolean for the clicked id. Defaults in the sample: first order + its first classification expanded.
- Data fetching: replace the hardcoded `data()` array with an API call returning the nested shape below.

### Data shape
```jsonc
Order {
  id, lsx,            // order code, e.g. "LSX2607020"
  ten,                // product name (order subtitle)
  chuyen,             // sewing line, e.g. "Mỹ Chi"
  note,               // date string, e.g. "12/07/2026"
  plan: { s, m, l, xl, xxl, ... },   // planned qty by size key
  mucs: [ Muc {
    id, name,          // stage, e.g. "Nhận thêu" / "Nhận in"
    loais: [ Loai {
      id, loai,        // garment type "Áo" | "Quần"  -> label = `${name} (${loai})`
      batches: [ Batch {
        id, dot,       // "Đợt 1"
        date,          // "12/07" (shown in Chuyền may col for batch rows)
        qty: { s, m, l, ... }   // received qty by size key
      } ]
    } ]
  } ]
}
```
Note: the design merges Mục + Loại into one displayed tier ("Nhận thêu (Áo)"). Keep them separate in data; concatenate only for the label.

## Design Tokens
**Colors**
- Accent green (headers, primary btn, title bar): `#217346`; hover `#185a37`.
- Accent dim (size header band): `#2d8a56` (= accent × ~1.18 brightness).
- Page bg `#dfe3e0`; card bg `#ffffff`; card border `#b7beb8`.
- Toolbar/footer bg `#f2f5f1`; toolbar/footer border `#cdd3cd`.
- Text primary `#1f2a24`; secondary `#54605a`; muted `#8a938c`; placeholder-ish `#9aa39c`.
- Gridlines: outer/strong `#c8ccc6`; inner size cells `#e2e6e1`; horizontal `#dfe3df`.
- Dash (empty number) `#c6ccc4`.
- Tier-1 number (planned) `#b45309` on bg `#fff7ed`.
- Tier-2 number (received) `#166534`, Tổng bg `#e3f0da`; tier-2 row band `#eef5e9`.
- Tier-3 number `#1f2937`/`#1f2a24`; tier-3 row band `#f6faf3`.
- Áo badge (if reused): text `#1e40af` on `#dbeafe`. Quần badge: text `#9a3412` on `#fde9d6`. (The dedicated "Phân loại" column was removed; type now lives in the label. Badges are optional.)

**Typography**
- Family: `"Segoe UI", Calibri, -apple-system, system-ui, sans-serif` (Excel feel).
- Sizes: order 13 / classification 12.5 / batch 12 / size-header 11 / body base 12.5; footer 12; title 17.
- Weights: 700 order & totals, 600 classification & headers, 500 batch, 400 adder.
- Numbers use `font-variant-numeric: tabular-nums`.

**Spacing / shape**
- Cell padding 8px 10px (comfortable) / 5px 8px (compact).
- Indent step: 12 / 34 / 58 px.
- Radius: card & inputs & buttons 4px; chevron & size badges 3px.
- Column widths: col A 308, Chuyền may 118, each size 56, Tổng 82, Ghi chú 150 px.
- Card shadow `0 10px 34px rgba(31,42,36,.16)`; sticky-col shadow `2px 0 0 rgba(31,42,36,.05–.08)`.

**Tweakable options (expose as props/settings if useful):**
- `accent` color (defaults `#217346`; alternates seen: `#375623`, `#1f6feb`, `#7e22ce`, `#9a3412`).
- `compact` boolean (tighter padding + header offsets).
- `banded` boolean (row banding on tiers 2/3).

## Assets
None. All icons are Unicode glyphs (`▦ ⌕ ⭳ ⇪ ＋ ⚙ ▸ ▾ –`). Replace with the codebase's icon set (search, download, upload, plus, gear, chevron) as preferred. No images or logos.

## Files
- `Quản lý sản xuất.dc.html` — the HTML design reference (included in this bundle). The template markup is the layout spec; the `<script>` `class Component` shows the data model, roll-up math, and per-tier styling logic. Ignore the `<x-dc>`/`support.js`/`{{ }}` runtime — it is prototype-only.
