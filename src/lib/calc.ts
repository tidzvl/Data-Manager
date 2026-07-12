// Tính biểu thức số học gõ thẳng vào ô: "100+200" → 300.
//
// Tự parse chứ không `eval`: nội dung ô là chuỗi người dùng gõ, mà `eval` thì
// nuốt luôn cả `fetch(...)`. Đây là đệ quy xuống theo đúng văn phạm:
//
//   expr   := term (("+" | "-") term)*
//   term   := factor (("*" | "/") factor)*
//   factor := ("+" | "-") factor | number | "(" expr ")"
//
// Cấp dưới gọi trước nên `*` `/` tự khắc chặt hơn `+` `-`, và `factor` gọi lại
// `expr` qua dấu ngoặc nên ngoặc lồng bao nhiêu tầng cũng được.

export type CalcResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * Ký tự MỞ được ô sửa khi gõ thẳng vào một ô đang đóng. Cố ý không có dấu cách:
 * Space là phím tick chọn dòng của bảng, không phải phím bắt đầu nhập.
 */
export const CALC_CHARS = /[\d+\-*/().]/;

/** Lọc bỏ ký tự không thuộc biểu thức. Dấu cách thì giữ — "100 + 200" phải gõ được. */
export const CALC_STRIP = /[^\d+\-*/().\s]/g;

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

function tokenize(src: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i];

    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === "+" || c === "-" || c === "*" || c === "/") {
      out.push({ kind: "op", value: c });
      i++;
      continue;
    }

    if (c === "(" || c === ")") {
      out.push({ kind: "paren", value: c });
      i++;
      continue;
    }

    if (/[\d.]/.test(c)) {
      const start = i;
      while (i < src.length && /[\d.]/.test(src[i])) i++;
      const text = src.slice(start, i);
      const value = Number(text);
      // Chặn "1.2.3": `Number` trả NaN, nhưng nói rõ chỗ sai thì dễ sửa hơn.
      if (!Number.isFinite(value)) return `Số không hợp lệ: "${text}"`;
      out.push({ kind: "num", value });
      continue;
    }

    return `Ký tự lạ: "${c}"`;
  }

  return out;
}

/**
 * Vị trí đọc để trong một ô nhỏ thay vì truyền xuôi ngược: ba hàm dưới đây đều
 * đọc và tiêu thụ chung một dòng token, kiểu con trỏ đọc của trình biên dịch.
 */
class Reader {
  constructor(
    private readonly tokens: Token[],
    private at = 0
  ) {}

  peek(): Token | undefined {
    return this.tokens[this.at];
  }

  next(): Token | undefined {
    return this.tokens[this.at++];
  }

  done(): boolean {
    return this.at >= this.tokens.length;
  }
}

/** Lỗi văn phạm ném ra từ trong lòng đệ quy, bắt lại một chỗ ở `calc`. */
class CalcError extends Error {}

function parseExpr(r: Reader): number {
  let left = parseTerm(r);

  for (;;) {
    const t = r.peek();
    if (t?.kind !== "op" || (t.value !== "+" && t.value !== "-")) return left;
    r.next();
    const right = parseTerm(r);
    left = t.value === "+" ? left + right : left - right;
  }
}

function parseTerm(r: Reader): number {
  let left = parseFactor(r);

  for (;;) {
    const t = r.peek();
    if (t?.kind !== "op" || (t.value !== "*" && t.value !== "/")) return left;
    r.next();
    const right = parseFactor(r);
    if (t.value === "/" && right === 0) throw new CalcError("Chia cho 0.");
    left = t.value === "*" ? left * right : left / right;
  }
}

function parseFactor(r: Reader): number {
  const t = r.next();
  if (!t) throw new CalcError("Biểu thức bị cụt.");

  if (t.kind === "op") {
    // Dấu một ngôi: "-5", và "--5" cũng chạy vì factor gọi lại chính nó.
    if (t.value === "-") return -parseFactor(r);
    if (t.value === "+") return parseFactor(r);
    throw new CalcError(`Thiếu số trước "${t.value}".`);
  }

  if (t.kind === "num") return t.value;

  if (t.value === "(") {
    const v = parseExpr(r);
    const close = r.next();
    if (close?.kind !== "paren" || close.value !== ")")
      throw new CalcError("Thiếu dấu ) đóng ngoặc.");
    return v;
  }

  throw new CalcError("Thừa dấu ) đóng ngoặc.");
}

/**
 * Tính một biểu thức. Chuỗi rỗng → 0 (ô trống nghĩa là không có gì).
 * Không bao giờ ném: mọi lối sai đều về `{ ok: false }` để caller đem đi báo lỗi.
 */
export function calc(src: string): CalcResult {
  const text = src.trim();
  if (text === "") return { ok: true, value: 0 };

  const tokens = tokenize(text);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  if (tokens.length === 0) return { ok: true, value: 0 };

  const r = new Reader(tokens);
  let value: number;
  try {
    value = parseExpr(r);
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.message };
    throw e;
  }

  // Còn token thừa nghĩa là văn phạm đã dừng sớm, ví dụ "1 2" hay "(1)2".
  if (!r.done()) return { ok: false, error: "Biểu thức không hợp lệ." };
  if (!Number.isFinite(value)) return { ok: false, error: "Kết quả không hợp lệ." };

  return { ok: true, value };
}

/**
 * Tính rồi ép về số lượng: nguyên, không âm.
 *
 * Số lẻ thì BÁO LỖI chứ không tự làm tròn — "10/4" mà lặng lẽ thành 2 hay 3 là
 * sửa số của người ta sau lưng họ. Nói ra con số để họ tự quyết.
 */
export function calcQty(src: string): CalcResult {
  const r = calc(src);
  if (!r.ok) return r;

  if (!Number.isInteger(r.value))
    return { ok: false, error: `Kết quả ${r.value} không phải số nguyên.` };
  if (r.value < 0) return { ok: false, error: "Số lượng không thể âm." };

  return r;
}
