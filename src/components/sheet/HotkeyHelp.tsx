"use client";

import FormModal from "@/components/ui/FormModal";

/**
 * Bảng tra phím tắt (`?`). Chỉ để đọc — bảng này là bản mô tả, còn nơi thực thi
 * là `OrdersGrid` và `OrdersDashboard`. Sửa phím thì phải sửa cả hai chỗ.
 */
const GROUPS: { title: string; keys: [string[], string][] }[] = [
  {
    title: "Di chuyển",
    keys: [
      [["↑", "↓"], "Lên / xuống một dòng đang hiển thị"],
      [["→"], "Mở dòng; đã mở thì đi vào ô số đầu tiên"],
      [["←"], "Gập dòng; đã gập thì leo lên dòng cấp trên"],
      [["Tab"], "Ô số kế, hết dòng thì tràn sang dòng dưới"],
      [["Shift", "Tab"], "Ô số trước"],
      [["Shift", "←"], "Gập tất cả"],
      [["Shift", "→"], "Mở tất cả"],
      [["Home"], "Dòng đầu bảng"],
      [["End"], "Dòng cuối bảng"],
    ],
  },
  {
    title: "Nhập số",
    keys: [
      [["Enter"], "Ở ô: mở sửa. Ở dòng: mở / gập dòng"],
      [["Enter"], "Đang sửa: lưu rồi xuống ô dưới cùng cột"],
      [["0", "–", "9"], "Gõ thẳng vào ô để sửa, đè số cũ"],
      [["Esc"], "Huỷ ô đang sửa, không lưu"],
      [["Delete"], "Đặt ô về 0"],
      [["←", "→"], "Đang sửa: hết đầu/cuối số thì sang ô kề"],
      [["a"], "Thêm đợt vào nhóm đang trỏ; ở Gửi may là thêm chi tiết"],
    ],
  },
  {
    title: "Chọn dòng",
    keys: [
      [["Space"], "Tick / bỏ tick dòng đang trỏ"],
      [["x"], "Như Space"],
      [["Shift", "↑"], "Nới dải chọn lên"],
      [["Shift", "↓"], "Nới dải chọn xuống"],
      [["Ctrl", "A"], "Chọn tất cả dòng trong trang"],
      [["Ctrl", "Delete"], "Xoá dòng đã chọn (có xác nhận)"],
    ],
  },
  {
    title: "Lệnh nhanh",
    keys: [
      [["/"], "Nhảy vào ô tìm kiếm"],
      [["n"], "Tạo LSX mới"],
      [["i"], "Nhập nhanh từ sheet"],
      [["e"], "Xuất Excel theo bộ lọc"],
      [["?"], "Mở bảng này"],
      [["Esc"], "Thoát khỏi trạng thái đang mở"],
    ],
  },
];

/** Tách khỏi modal để dựng được ngoài Radix (harness chụp màn hình). */
export function HotkeyList() {
  return (
    // 4 cột ở màn rộng: nhóm dài nhất quyết định chiều cao, xếp 2 cột thì nhóm
    // ngắn để hở nửa khối.
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
      {GROUPS.map((g) => (
        <section key={g.title}>
          <h3
            className="mb-2 text-xs font-semibold uppercase"
            style={{ letterSpacing: ".5px", color: "rgba(198,181,255,0.9)" }}
          >
            {g.title}
          </h3>
          <dl className="flex flex-col gap-1.5">
            {g.keys.map(([keys, desc], i) => (
              <div key={i} className="flex items-baseline gap-3">
                <dt className="flex shrink-0 items-center gap-1">
                  {keys.map((k, j) => (
                    <Key key={j} label={k} />
                  ))}
                </dt>
                <dd
                  className="text-[12.5px] leading-snug"
                  style={{ color: "var(--g-text-2, rgba(255,255,255,0.75))" }}
                >
                  {desc}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export default function HotkeyHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      sheet
      wide
      title="Phím tắt"
      description="Bấm ? bất cứ lúc nào để mở lại bảng này."
    >
      <HotkeyList />
    </FormModal>
  );
}

/** Dấu "–" là gạch nối giữa hai phím, không phải một phím. */
function Key({ label }: { label: string }) {
  if (label === "–")
    return (
      <span style={{ opacity: 0.5, fontSize: 11 }} aria-hidden>
        –
      </span>
    );
  return (
    <kbd
      className="nums inline-flex items-center justify-center"
      style={{
        minWidth: 22,
        height: 22,
        padding: "0 6px",
        borderRadius: 6,
        background: "rgba(255,255,255,0.10)",
        border: "1px solid var(--g-line-3, rgba(255,255,255,0.18))",
        boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.25)",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "inherit",
        color: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </kbd>
  );
}
