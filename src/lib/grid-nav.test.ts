import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COL_NAME,
  buildNav,
  collapseOrOut,
  expandOrIn,
  isEditable,
  moveHorizontal,
  moveTab,
  moveVertical,
  reanchor,
  rowAt,
  selectableRange,
} from "./grid-nav";
import type { Cell, GridChild, GridOrder, GridRow } from "./grid-types";

// Hai cột size. Cột 0 có khai báo, cột 1 thì không — để bắt đúng cái ô "–" mà
// mũi tên vẫn phải đi qua được.
const cells = (v = 0): Cell[] => [
  { orderSizeId: 10, value: v, done: v, target: 0 },
  { orderSizeId: null, value: 0, done: 0, target: 0 },
];

/** Sau hai cột size là ba cột đuôi: Tổng (2), Ngày (3), Ghi chú (4). */
const TOTAL = 2;
const DATE = 3;
const NOTE = 4;

const batch = (key: string, movementId: number): GridChild => ({
  key,
  label: `Đợt ${key}`,
  dateLabel: "01/07",
  dateIso: "2026-07-01",
  note: null,
  color: null,
  cells: cells(5),
  total: 5,
  edit: "item",
  partId: null,
  movementId,
});

const row = (over: Partial<GridRow>): GridRow => ({
  key: "stage-1",
  stageId: 1,
  orderId: 1,
  code: "LSX-1",
  productName: "Áo",
  lineName: null,
  categoryId: 7,
  categoryName: "Áo",
  muc: "EMB_IN",
  mucLabel: "Nhận thêu",
  missingMucs: [],
  note: null,
  createdAt: "01/07/2026",
  createdAtIso: "2026-07-01",
  cells: cells(5),
  total: 5,
  children: [],
  childHeader: "",
  ...over,
});

/** LSX → mục "Nhận thêu" (2 đợt) → mục "Gửi may" (1 chi tiết → 1 đợt). */
const order: GridOrder = {
  key: "order-1",
  orderId: 1,
  code: "LSX-1",
  productName: "Áo",
  lineName: null,
  note: null,
  createdAt: "01/07/2026",
  createdAtIso: "2026-07-01",
  plan: [200, 0],
  planTotal: 200,
  rows: [
    row({
      key: "stage-1",
      children: [batch("mv-1-all", 91), batch("mv-2-all", 92)],
    }),
    row({
      key: "stage-2",
      stageId: 2,
      muc: "SEW_OUT",
      mucLabel: "Gửi may",
      children: [
        {
          key: "part-3",
          label: "Thân trước",
          dateLabel: "",
          dateIso: null,
          note: "Định mức",
          color: null,
          cells: cells(200),
          total: 200,
          edit: "target",
          partId: 3,
          movementId: null,
          batches: [{ ...batch("mv-9-all", 99), partId: 3 }],
        },
      ],
    }),
  ],
};

const ALL_OPEN = {
  orders: { "order-1": true },
  rows: { "order-1/stage-1": true, "order-1/stage-2": true },
  parts: { "order-1/stage-2/part-3": true },
};

/** Cây mở hết: 1 LSX + 2 mục + 2 đợt + 1 chi tiết + 1 đợt con = 7 dòng. */
const full = () =>
  buildNav([order], ALL_OPEN.orders, ALL_OPEN.rows, ALL_OPEN.parts);

test("buildNav chiếu đúng cây đang hiện", () => {
  const nav = full();
  assert.deepEqual(
    nav.map((r) => r.id),
    [
      "order-1",
      "order-1/stage-1",
      "order-1/stage-1/mv-1-all",
      "order-1/stage-1/mv-2-all",
      "order-1/stage-2",
      "order-1/stage-2/part-3",
      "order-1/stage-2/part-3/mv-9-all",
    ]
  );

  // Gập LSX lại thì không còn dòng con nào — mắt không thấy, phím không đi qua.
  assert.equal(buildNav([order], {}, {}, {}).length, 1);
});

test("ô chỉ đọc: đi qua được, nhưng không gõ được", () => {
  const nav = full();

  const orderRow = rowAt(nav, "order-1")!;
  const stageRow = rowAt(nav, "order-1/stage-1")!;
  const batchRow = rowAt(nav, "order-1/stage-1/mv-1-all")!;

  assert.equal(isEditable(orderRow, 0), false, "SL gốc của LSX chỉ đọc");
  assert.equal(isEditable(stageRow, 0), false, "ô dòng mục là tổng suy ra");
  assert.equal(isEditable(batchRow, 0), true, "ô của đợt gõ được");
  // Phân loại không khai báo size này → ô "–", đậu được nhưng không gõ.
  assert.equal(isEditable(batchRow, 1), false);
  // Tổng là số suy ra, ở mọi dòng.
  assert.equal(isEditable(batchRow, TOTAL), false);
});

test("Ngày và Ghi chú gõ được ở LSX và ở đợt, không gõ được ở mục", () => {
  const nav = full();
  const orderRow = rowAt(nav, "order-1")!;
  const stageRow = rowAt(nav, "order-1/stage-1")!;
  const partRow = rowAt(nav, "order-1/stage-2/part-3")!;
  const batchRow = rowAt(nav, "order-1/stage-1/mv-1-all")!;

  for (const col of [DATE, NOTE]) {
    assert.equal(isEditable(orderRow, col), true);
    assert.equal(isEditable(batchRow, col), true);
    // Ngày/Ghi chú của dòng mục là số liệu suy ra (ngày LSX, trạng thái đủ/thiếu).
    assert.equal(isEditable(stageRow, col), false);
    assert.equal(isEditable(partRow, col), false);
  }
});

test("tên mục gõ được; tên của LSX, chi tiết, đợt thì không", () => {
  const nav = full();

  assert.equal(isEditable(rowAt(nav, "order-1/stage-1")!, COL_NAME), true);
  assert.equal(isEditable(rowAt(nav, "order-1")!, COL_NAME), false);
  assert.equal(
    isEditable(rowAt(nav, "order-1/stage-2/part-3")!, COL_NAME),
    false
  );
  assert.equal(
    isEditable(rowAt(nav, "order-1/stage-1/mv-1-all")!, COL_NAME),
    false
  );
});

test("↑/↓ giữ nguyên cột và KHÔNG bỏ qua dòng chỉ đọc", () => {
  const nav = full();

  // Từ ô số của một đợt đi lên: đậu đúng vào ô chỉ đọc của dòng mục ngay trên,
  // chứ không phóng qua nó để tìm ô gõ được tiếp theo.
  assert.deepEqual(moveVertical(nav, { id: "order-1/stage-1/mv-1-all", col: 0 }, -1), {
    id: "order-1/stage-1",
    col: 0,
  });

  // Và đi lên lần nữa thì tới dòng LSX, vẫn giữ cột 0.
  assert.deepEqual(moveVertical(nav, { id: "order-1/stage-1", col: 0 }, -1), {
    id: "order-1",
    col: 0,
  });

  // Hết bảng thì đứng yên.
  assert.equal(moveVertical(nav, { id: "order-1", col: 0 }, -1), null);
  assert.equal(
    moveVertical(nav, { id: "order-1/stage-2/part-3/mv-9-all", col: 0 }, 1),
    null
  );

  // Cột A cũng đi dọc được như mọi cột khác.
  assert.deepEqual(moveVertical(nav, { id: "order-1", col: COL_NAME }, 1), {
    id: "order-1/stage-1",
    col: COL_NAME,
  });
});

test("←/→ đi trong dòng, dừng ở hai mép, không gập/mở gì cả", () => {
  const nav = full();
  const id = "order-1/stage-1/mv-1-all";

  assert.deepEqual(moveHorizontal(nav, { id, col: COL_NAME }, 1), { id, col: 0 });
  assert.deepEqual(moveHorizontal(nav, { id, col: 0 }, 1), { id, col: 1 });
  // Đi tiếp được qua cả cụm đuôi: Tổng → Ngày → Ghi chú.
  assert.deepEqual(moveHorizontal(nav, { id, col: 1 }, 1), { id, col: TOTAL });
  assert.deepEqual(moveHorizontal(nav, { id, col: DATE }, 1), { id, col: NOTE });
  // Ghi chú là cột cuối: đứng yên, không tràn sang dòng khác.
  assert.equal(moveHorizontal(nav, { id, col: NOTE }, 1), null);

  assert.deepEqual(moveHorizontal(nav, { id, col: 0 }, -1), { id, col: COL_NAME });
  // Cột A là mép trái.
  assert.equal(moveHorizontal(nav, { id, col: COL_NAME }, -1), null);
});

test("Tab bỏ qua ô không gõ được và tràn sang dòng kế", () => {
  const nav = full();

  // Cột 1 và cột Tổng không gõ được → Tab từ cột 0 nhảy thẳng tới ô Ngày.
  assert.deepEqual(moveTab(nav, { id: "order-1/stage-1/mv-1-all", col: 0 }, 1), {
    id: "order-1/stage-1/mv-1-all",
    col: DATE,
  });

  // Hết ô gõ được của dòng thì mới tràn sang dòng kế.
  assert.deepEqual(
    moveTab(nav, { id: "order-1/stage-1/mv-1-all", col: NOTE }, 1),
    { id: "order-1/stage-1/mv-2-all", col: 0 }
  );

  // Dòng mục không có ô số nào gõ được, nhưng TÊN của nó thì có — Tab lùi từ ô
  // số đầu tiên của đợt phải đậu vào đó, chứ không phóng qua cả dòng mục.
  assert.deepEqual(
    moveTab(nav, { id: "order-1/stage-1/mv-1-all", col: 0 }, -1),
    { id: "order-1/stage-1", col: COL_NAME }
  );
});

test("Ctrl+←/→ gập, mở, và leo cây — cột giữ nguyên", () => {
  const nav = full();

  assert.deepEqual(collapseOrOut(nav, { id: "order-1/stage-1", col: 0 }), {
    kind: "collapse",
    id: "order-1/stage-1",
  });

  // Dòng đợt không gập được → leo lên dòng cha, vẫn ở cột 0.
  assert.deepEqual(
    collapseOrOut(nav, { id: "order-1/stage-1/mv-1-all", col: 0 }),
    { kind: "goto", cursor: { id: "order-1/stage-1", col: 0 } }
  );

  // Ở LSX gốc, đã gập rồi thì không leo đi đâu được nữa.
  const collapsed = buildNav([order], {}, {}, {});
  assert.equal(collapseOrOut(collapsed, { id: "order-1", col: 0 }), null);
  assert.deepEqual(expandOrIn(collapsed, { id: "order-1", col: 0 }), {
    kind: "expand",
    id: "order-1",
  });

  // Đã mở rồi thì Ctrl+→ đi vào dòng con đầu tiên.
  assert.deepEqual(expandOrIn(nav, { id: "order-1", col: 1 }), {
    kind: "goto",
    cursor: { id: "order-1/stage-1", col: 1 },
  });

  // Dòng đợt không có gì để mở.
  assert.equal(expandOrIn(nav, { id: "order-1/stage-1/mv-1-all", col: 0 }), null);
});

test("tick chọn được: dòng mục và dòng đợt, không phải LSX hay chi tiết", () => {
  const nav = full();
  assert.deepEqual(
    nav.filter((r) => r.selectable).map((r) => r.id),
    [
      "order-1/stage-1",
      "order-1/stage-1/mv-1-all",
      "order-1/stage-1/mv-2-all",
      "order-1/stage-2",
      "order-1/stage-2/part-3/mv-9-all",
    ]
  );

  // Đích xoá nói rõ đi server action nào.
  assert.deepEqual(rowAt(nav, "order-1/stage-1/mv-1-all")!.target, {
    kind: "batch",
    movementId: 91,
    label: "Đợt mv-1-all",
  });
  assert.equal(rowAt(nav, "order-1/stage-1")!.target?.kind, "stage");
  assert.equal(rowAt(nav, "order-1")!.target, null);
  assert.equal(rowAt(nav, "order-1/stage-2/part-3")!.target, null);
});

test("dải Shift+↑/↓ chỉ nhặt dòng tick được", () => {
  const nav = full();
  assert.deepEqual(
    selectableRange(nav, "order-1", "order-1/stage-1/mv-2-all"),
    [
      "order-1/stage-1",
      "order-1/stage-1/mv-1-all",
      "order-1/stage-1/mv-2-all",
    ]
  );
});

test("gập mất dòng đang trỏ thì con trỏ leo về tổ tiên còn hiện", () => {
  const collapsed = buildNav([order], { "order-1": true }, {}, {});

  assert.deepEqual(
    reanchor(collapsed, { id: "order-1/stage-1/mv-1-all", col: 1 }),
    { id: "order-1/stage-1", col: 1 }
  );

  // Không còn tổ tiên nào → bỏ con trỏ đi.
  assert.equal(reanchor(buildNav([], {}, {}, {}), { id: "order-1", col: 0 }), null);
});
