import assert from "node:assert/strict";
import { test } from "node:test";
import { calc, calcQty } from "./calc";

/** Gọn tay cho những trường hợp phải ra số. */
function val(src: string): number {
  const r = calc(src);
  assert.ok(r.ok, `"${src}" phải tính được, nhưng: ${r.ok ? "" : r.error}`);
  return r.value;
}

function err(src: string): string {
  const r = calc(src);
  assert.ok(!r.ok, `"${src}" lẽ ra phải sai, nhưng ra ${r.ok ? r.value : ""}`);
  return r.error;
}

test("số trần", () => {
  assert.equal(val("500"), 500);
  assert.equal(val("  42  "), 42);
  assert.equal(val("2.5"), 2.5);
  // Ô trống nghĩa là không có gì, không phải lỗi.
  assert.equal(val(""), 0);
  assert.equal(val("   "), 0);
});

test("bốn phép tính", () => {
  assert.equal(val("100+200"), 300);
  assert.equal(val("100 - 40"), 60);
  assert.equal(val("12*5"), 60);
  assert.equal(val("120/4"), 30);
});

test("nhân chia chặt hơn cộng trừ", () => {
  assert.equal(val("2+3*4"), 14);
  assert.equal(val("2*3+4"), 10);
  assert.equal(val("100-2*10"), 80);
  assert.equal(val("100/2/5"), 10);
  assert.equal(val("10-3-2"), 5);
});

test("ngoặc, kể cả lồng nhau", () => {
  assert.equal(val("(2+3)*4"), 20);
  assert.equal(val("((1+2)*(3+4))"), 21);
  assert.equal(val("2*(3+(4-1))"), 12);
});

test("dấu một ngôi", () => {
  assert.equal(val("-5"), -5);
  assert.equal(val("10*-2"), -20);
  assert.equal(val("10--2"), 12);
  assert.equal(val("+7"), 7);
});

test("biểu thức sai thì báo lỗi, không đoán bừa", () => {
  err("1+");
  err("(1+2");
  err("1+2)");
  err("1 2");
  err("*5");
  err("100+abc");
  err("1.2.3");
  assert.match(err("5/0"), /Chia cho 0/);
});

test("calcQty ép về số lượng: nguyên, không âm", () => {
  const ok = calcQty("100+200");
  assert.deepEqual(ok, { ok: true, value: 300 });

  // Số lẻ thì nói thẳng ra chứ không lặng lẽ làm tròn hộ.
  const half = calcQty("10/4");
  assert.ok(!half.ok);
  assert.match(half.error, /2\.5.*không phải số nguyên/);

  const neg = calcQty("5-10");
  assert.ok(!neg.ok);
  assert.match(neg.error, /không thể âm/);

  // Chia hết thì vẫn là số nguyên, không vướng số lẻ nhị phân.
  assert.deepEqual(calcQty("120/4"), { ok: true, value: 30 });
});
