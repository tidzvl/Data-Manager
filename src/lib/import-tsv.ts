/**
 * Bóc TSV dán từ sheet quản lý sản xuất.
 *
 * Không import "server-only": modal dùng chính hàm này để xem trước ngay trên
 * client, còn server thì bóc lại từ text thô chứ không tin dữ liệu client gửi lên.
 *
 * Sheet không có dòng tiêu đề, nên mọi thứ định vị bằng chỉ số cột. Các chỉ số
 * dưới đây đã đối chiếu với file mẫu 104 cột × 7 dòng.
 */

/** Cột đầu tiên của khối size (đơn đặt hàng). */
export const SIZE_COL_START = 12;
/** 11 ô, ánh xạ 1:1 vào SizeType theo `position` 0→10. */
export const SIZE_COL_COUNT = 11;

export const COL = {
  code: 0,
  productName: 5,
  unit: 11,
  /** Tổng của khối size — dùng để soát, không ghi vào DB. */
  total: 23,
  lineName: 53,
  /** Danh sách chi tiết, ngăn bằng dấu phẩy. */
  parts: 69,
  /** Danh mục (nhóm sản phẩm) — cột cuối cùng có dữ liệu. Lái Mục mặc định. */
  category: 102,
} as const;

/**
 * Danh mục hợp lệ. Cố ý là danh sách đóng: ô này ở sheet từng bị dán hỏng
 * (một ô nuốt cả trăm tên dính liền), mà dòng hỏng thì lọt vào DB sẽ rất khó gỡ.
 * Sheet thêm nhóm sản phẩm mới thì phải thêm vào đây, nếu không dòng bị loại.
 */
export const PRODUCT_GROUPS = [
  "Áo bóng đá",
  "Áo bơi",
  "Áo chạy bộ",
  "Áo Jersey",
  "Áo khoác",
  "Áo Polo",
  "Áo thể thao",
  "Bộ đồ bơi",
  "Chân váy",
  "Đội tuyển",
  "Phụ kiện",
  "Quần áo bóng đá",
  "Quần áo bóng rổ",
  "Quần áo câu lạc bộ",
  "Quần bóng chuyền",
  "Quần bóng đá",
  "Quần bơi",
  "Quần thể thao",
] as const;

const GROUP_BY_KEY = new Map(
  PRODUCT_GROUPS.map((g) => [g.toLowerCase(), g] as const)
);

/** Trả về tên chuẩn của danh mục, hoặc null nếu trống / không nhận ra. */
export function normalizeGroup(raw: string): string | null {
  return GROUP_BY_KEY.get(raw.trim().toLowerCase()) ?? null;
}

/** Hai nhóm này gia công thêu trước rồi mới may. */
const EMBROIDERY_GROUPS = new Set(["Đội tuyển", "Quần áo câu lạc bộ"]);

/**
 * Khối cột 41–51 (tổng ở 52) là SỐ LƯỢNG CẮT, thường lớn hơn số đặt hàng vì
 * cắt dư. Không dùng: `OrderSize.targetQty` mang nghĩa SL thành phẩm kế hoạch.
 */

export type Unit = "Cái" | "Bộ";

export type ParsedRow = {
  /** 1-based, để báo lỗi đúng dòng người dùng dán. */
  index: number;
  code: string;
  productName: string;
  unit: Unit | null;
  lineName: string;
  /** "Cái" → 1 phân loại; "Bộ" → Áo + Quần, số lượng bằng nhau. */
  categories: string[];
  /** Dài đúng SIZE_COL_COUNT, khớp thứ tự SizeType. */
  qty: number[];
  total: number;
  parts: string[];
  /** Danh mục đã chuẩn hoá; null = trống hoặc không nhận ra (dòng sẽ bị loại). */
  category: string | null;
  /** Có giá trị = dòng bị loại, không import. */
  error?: string;
};

function cell(cols: string[], i: number): string {
  return (cols[i] ?? "").trim();
}

function int(raw: string): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** "Cái" thì suy phân loại từ tên sản phẩm; "Bộ" thì luôn là Áo + Quần. */
function categoriesFor(unit: Unit, productName: string): string[] {
  if (unit === "Bộ") return ["Áo", "Quần"];
  const p = productName.toLowerCase();
  if (/^quần|\bjean\b/.test(p)) return ["Quần"];
  if (/^(chân )?váy/.test(p)) return ["Váy"];
  return ["Áo"];
}

function uniq(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n);
    }
  }
  return out;
}

/**
 * @param sizeLabels nhãn SizeType theo `position`, chỉ dùng để báo lỗi cho dễ hiểu.
 */
export function parseTsv(text: string, sizeLabels: string[]): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const seenCodes = new Set<string>();
  const out: ParsedRow[] = [];

  lines.forEach((line, i) => {
    const cols = line.split("\t");
    const productName = cell(cols, COL.productName);

    // Dòng đã xoá tên sản phẩm coi như dòng rác trong sheet: bỏ im lặng, không
    // báo lỗi và cũng không soi tiếp danh mục — kêu ca về nó chỉ tổ ồn.
    if (!productName) return;

    const code = cell(cols, COL.code);
    const unitRaw = cell(cols, COL.unit);
    const lineName = cell(cols, COL.lineName);
    const total = int(cell(cols, COL.total));
    const categoryRaw = cell(cols, COL.category);

    const qty = Array.from({ length: SIZE_COL_COUNT }, (_, k) =>
      int(cell(cols, SIZE_COL_START + k))
    );
    const sum = qty.reduce((a, b) => a + b, 0);

    const parts = uniq(
      cell(cols, COL.parts)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );

    const unit: Unit | null =
      unitRaw === "Cái" || unitRaw === "Bộ" ? unitRaw : null;

    const row: ParsedRow = {
      index: i + 1,
      code,
      productName,
      unit,
      lineName,
      categories: unit ? categoriesFor(unit, productName) : [],
      qty,
      total,
      parts,
      category: normalizeGroup(categoryRaw),
    };

    row.error = validate(row, sum, unitRaw, categoryRaw, sizeLabels, seenCodes);
    if (!row.error) seenCodes.add(code);
    out.push(row);
  });

  return out;
}

function validate(
  row: ParsedRow,
  sum: number,
  unitRaw: string,
  categoryRaw: string,
  sizeLabels: string[],
  seenCodes: Set<string>
): string | undefined {
  if (!row.code) return "Thiếu mã LSX (cột 1).";
  if (seenCodes.has(row.code)) return `Mã "${row.code}" bị lặp trong dữ liệu dán.`;

  if (!row.category) {
    if (!categoryRaw) return "Thiếu Danh mục (cột 103).";
    // Ô dán hỏng có thể dài hàng trăm ký tự — cắt bớt, không thì thông báo lỗi
    // dài hơn cả bảng.
    const shown =
      categoryRaw.length > 40 ? `${categoryRaw.slice(0, 40)}…` : categoryRaw;
    return `Danh mục "${shown}" không có trong danh sách (cột 103).`;
  }

  if (!row.unit)
    return `Đơn vị "${unitRaw || "(trống)"}" không hiểu — chỉ nhận "Cái" hoặc "Bộ".`;
  if (sum === 0) return "Không có số lượng ở size nào (cột 13–23).";

  // Sheet có nhiều size hơn danh mục SizeType thì gán sai size mà tổng vẫn đúng.
  for (let k = sizeLabels.length; k < SIZE_COL_COUNT; k++) {
    if (row.qty[k] > 0)
      return `Có số lượng ở cột size thứ ${k + 1} nhưng danh mục chỉ có ${sizeLabels.length} size.`;
  }

  if (row.total > 0 && row.total !== sum)
    return `Tổng ghi ở cột 24 là ${row.total} nhưng cộng các size ra ${sum}.`;

  return undefined;
}

/** Tóm tắt size có số lượng, để hiện ở bảng xem trước. */
export function sizeSummary(row: ParsedRow, sizeLabels: string[]): string {
  return row.qty
    .map((q, i) => (q > 0 ? `${sizeLabels[i] ?? `#${i}`}:${q}` : null))
    .filter(Boolean)
    .join("  ");
}

/* ------------------------------------------------------------------ *
 * Bản nháp — người dùng sửa được trong modal trước khi ghi vào DB.
 * ------------------------------------------------------------------ */

export type Muc = "SEW_OUT" | "SEW_IN" | "EMB_OUT" | "EMB_IN";

/** Gửi may/Gửi thêu đã bị bỏ — import chỉ còn tạo được 2 mục "nhận". */
export const MUC_CHOICES: { value: Muc; label: string }[] = [
  { value: "SEW_IN", label: "Nhận may" },
  { value: "EMB_IN", label: "Nhận thêu" },
];

export type DraftPart = {
  name: string;
  /** Định mức theo size, dài bằng `qty`. */
  qty: number[];
};

/** Một dòng nháp = (LSX × Phân loại). "Bộ" sinh hai dòng độc lập nhau. */
export type ImportDraft = {
  code: string;
  productName: string;
  lineName: string;
  categoryName: string;
  muc: Muc;
  qty: number[];
  /** Chỉ dùng khi muc = "SEW_OUT"; các mục khác không có chi tiết. */
  parts: DraftPart[];
};

/**
 * Mục mặc định khi vừa dán vào, suy từ Danh mục: hàng đội tuyển / câu lạc bộ
 * đi theo nhánh thêu nên vào "Nhận thêu"; còn lại theo dõi ở "Nhận may".
 * Vẫn sửa tay được từng dòng trong modal.
 */
export function defaultMucFor(category: string | null): Muc {
  return category && EMBROIDERY_GROUPS.has(category) ? "EMB_IN" : "SEW_IN";
}

/**
 * Dựng nháp từ các dòng đã bóc.
 *
 * Chi tiết luôn được điền sẵn với định mức = SL kế hoạch của size đó (may mặc:
 * mỗi sản phẩm cần đúng một cái của mỗi chi tiết), kể cả khi Mục mặc định không
 * phải "Gửi may" — đổi Mục sang "Gửi may" là thấy ngay, không phải gõ lại.
 */
export function draftsFromRows(rows: ParsedRow[]): ImportDraft[] {
  return rows
    .filter((r) => !r.error)
    .flatMap((r) =>
      r.categories.map((categoryName) => ({
        code: r.code,
        productName: r.productName,
        lineName: r.lineName,
        categoryName,
        muc: defaultMucFor(r.category),
        qty: [...r.qty],
        parts: r.parts.map((name) => ({ name, qty: [...r.qty] })),
      }))
    );
}

/** Chỉ số các size có số lượng ở ít nhất một dòng nháp — để bảng khỏi 11 cột. */
export function activeSizeIndexes(drafts: ImportDraft[]): number[] {
  const active: number[] = [];
  for (let i = 0; i < SIZE_COL_COUNT; i++) {
    if (drafts.some((d) => d.qty[i] > 0 || d.parts.some((p) => p.qty[i] > 0)))
      active.push(i);
  }
  return active;
}

export function draftTotal(qty: number[]): number {
  return qty.reduce((a, b) => a + b, 0);
}

/**
 * Sửa SL kế hoạch ở một size.
 *
 * Kéo theo định mức của các chi tiết CHƯA bị sửa tay (định mức của chúng còn
 * đúng bằng SL cũ). Không làm vậy thì dòng cha ghi 41 mà chi tiết vẫn 40 — sai
 * mà nhìn không ra. Chi tiết đã chỉnh riêng thì giữ nguyên.
 */
export function applyQty(
  draft: ImportDraft,
  sizeIndex: number,
  value: number
): ImportDraft {
  const old = draft.qty[sizeIndex];
  const swap = (arr: number[]) =>
    arr.map((q, k) => (k === sizeIndex ? value : q));

  return {
    ...draft,
    qty: swap(draft.qty),
    parts: draft.parts.map((p) =>
      p.qty[sizeIndex] === old ? { ...p, qty: swap(p.qty) } : p
    ),
  };
}

/** Kiểm tra nháp trước khi ghi. Chạy cả ở client (chặn bấm Nhập) lẫn ở server. */
export function validateDrafts(drafts: ImportDraft[]): string | null {
  if (drafts.length === 0) return "Không có dòng nào để nhập.";

  for (const d of drafts) {
    const where = `${d.code || "(thiếu mã)"} · ${d.categoryName}`;
    if (!d.code.trim()) return "Có dòng thiếu mã LSX.";
    if (!d.productName.trim()) return `${where}: thiếu tên sản phẩm.`;
    if (!d.categoryName.trim()) return `${d.code}: thiếu tên phân loại.`;
    if (!MUC_CHOICES.some((m) => m.value === d.muc))
      return `${where}: mục không hợp lệ.`;
    if (d.qty.some((q) => !Number.isInteger(q) || q < 0))
      return `${where}: số lượng phải là số nguyên không âm.`;
    if (draftTotal(d.qty) === 0) return `${where}: chưa có số lượng ở size nào.`;

    if (d.muc === "SEW_OUT") {
      for (const p of d.parts) {
        if (!p.name.trim()) return `${where}: có chi tiết chưa đặt tên.`;
        if (p.qty.some((q) => !Number.isInteger(q) || q < 0))
          return `${where} · ${p.name}: định mức phải là số nguyên không âm.`;
      }
    }
  }

  // Trùng nhau chỉ khi cả ba cùng trùng: cùng LSX, cùng phân loại, cùng mục.
  // (LSX + Áo + Nhận may) và (LSX + Áo + Gửi may) là hai dòng hợp lệ.
  const seen = new Set<string>();
  for (const d of drafts) {
    const key = `${d.code}|${d.categoryName.toLowerCase()}|${d.muc}`;
    if (seen.has(key)) return `${draftLabel(d)}: bị lặp trong dữ liệu dán.`;
    seen.add(key);
  }
  return null;
}

export function mucLabel(muc: Muc): string {
  return MUC_CHOICES.find((m) => m.value === muc)?.label ?? muc;
}

/** Nhãn nhận diện một dòng nháp, dùng trong thông báo và bảng xem trước. */
export function draftLabel(d: ImportDraft): string {
  return `${d.code} · ${d.categoryName} · ${mucLabel(d.muc)}`;
}
