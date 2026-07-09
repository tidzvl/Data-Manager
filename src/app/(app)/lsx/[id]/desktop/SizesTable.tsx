import type { OrderDetail } from "@/lib/aggregate";
import { pct } from "@/components/ProgressBar";

/** Bảng theo size: kế hoạch → đã may → gửi thêu → nhận về → còn ở thêu. */
export default function SizesTable({ detail }: { detail: OrderDetail }) {
  if (detail.categories.length === 0)
    return (
      <p className="px-3 py-8 text-center text-sm text-muted">
        Chưa có phân loại nào.
      </p>
    );

  return (
    <div className="space-y-5">
      {detail.categories.map((c) => {
        const tot = c.sizes.reduce(
          (a, s) => ({
            target: a.target + s.targetQty,
            sewn: a.sewn + (detail.sewInBySize[s.id] ?? 0),
            sent: a.sent + (detail.embOutBySize[s.id] ?? 0),
            back: a.back + (detail.embInBySize[s.id] ?? 0),
          }),
          { target: 0, sewn: 0, sent: 0, back: 0 }
        );

        return (
          <section
            key={c.id}
            className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-3 py-2">
              <span className="text-sm font-semibold">{c.name}</span>
              <span className="nums text-xs text-muted">
                đã may {tot.sewn}/{tot.target}
              </span>
            </div>

            <table className="dt">
              <thead>
                <tr>
                  <th>Size</th>
                  <th className="!text-right">Kế hoạch</th>
                  <th className="!text-right">Đã may</th>
                  <th className="!text-right">Còn thiếu</th>
                  <th className="min-w-[10rem]">Tiến độ may</th>
                  <th className="!text-right">Gửi thêu</th>
                  <th className="!text-right">Nhận về</th>
                  <th className="!text-right">Còn ở thêu</th>
                </tr>
              </thead>
              <tbody>
                {c.sizes.map((s) => {
                  const sewn = detail.sewInBySize[s.id] ?? 0;
                  const sent = detail.embOutBySize[s.id] ?? 0;
                  const back = detail.embInBySize[s.id] ?? 0;
                  const short = s.targetQty - sewn;
                  const atEmb = sent - back;
                  const p = pct(sewn, s.targetQty);
                  return (
                    <tr key={s.id}>
                      <td className="nums font-semibold">{s.sizeLabel}</td>
                      <td className="num text-muted">{s.targetQty}</td>
                      <td className="num font-medium">{sewn}</td>
                      <td
                        className={`num font-semibold ${
                          short > 0 ? "text-short" : "text-ok"
                        }`}
                      >
                        {short > 0 ? short : "✓"}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${p}%`,
                                background:
                                  short <= 0
                                    ? "var(--color-ok)"
                                    : "var(--color-brand)",
                              }}
                            />
                          </div>
                          <span className="nums w-9 text-right text-xs text-muted">
                            {p}%
                          </span>
                        </div>
                      </td>
                      <td className="num text-muted">{sent || "—"}</td>
                      <td className="num text-muted">{back || "—"}</td>
                      <td className="num">
                        {atEmb > 0 ? (
                          <span className="rounded-md bg-warn-soft px-1.5 py-0.5 font-medium text-warn">
                            {atEmb}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2">
                  <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint">
                    Tổng
                  </td>
                  <td className="num px-3 py-2 font-semibold">{tot.target}</td>
                  <td className="num px-3 py-2 font-semibold">{tot.sewn}</td>
                  <td
                    className={`num px-3 py-2 font-semibold ${
                      tot.target - tot.sewn > 0 ? "text-short" : "text-ok"
                    }`}
                  >
                    {tot.target - tot.sewn > 0 ? tot.target - tot.sewn : "✓"}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="num px-3 py-2 font-semibold">{tot.sent}</td>
                  <td className="num px-3 py-2 font-semibold">{tot.back}</td>
                  <td className="num px-3 py-2 font-semibold text-warn">
                    {tot.sent - tot.back || "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
    </div>
  );
}
