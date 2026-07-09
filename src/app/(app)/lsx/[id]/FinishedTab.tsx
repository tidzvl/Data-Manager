import { Factory } from "lucide-react";
import type { OrderDetail } from "@/lib/aggregate";

export default function FinishedTab({ detail }: { detail: OrderDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <Factory size={14} className="text-brand" />
        Chuyền phụ trách:{" "}
        <span className="font-semibold text-ink">
          {detail.lineName ?? "chưa gán"}
        </span>
      </div>

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
              <h3 className="font-semibold">{c.name}</h3>
              <span className="nums text-sm text-muted">
                đã may {tot.sewn}/{tot.target}
              </span>
            </div>

            <div className="xscroll">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="px-3 py-2 text-left font-medium">Size</th>
                    <th className="px-2 py-2 text-right font-medium">KH</th>
                    <th className="px-2 py-2 text-right font-medium">Đã may</th>
                    <th className="px-2 py-2 text-right font-medium">Thiếu</th>
                    <th className="px-2 py-2 text-right font-medium">
                      Gửi thêu
                    </th>
                    <th className="px-2 py-2 text-right font-medium">Về</th>
                    <th className="px-3 py-2 text-right font-medium">Ở thêu</th>
                  </tr>
                </thead>
                <tbody>
                  {c.sizes.map((s) => {
                    const sewn = detail.sewInBySize[s.id] ?? 0;
                    const sent = detail.embOutBySize[s.id] ?? 0;
                    const back = detail.embInBySize[s.id] ?? 0;
                    const short = s.targetQty - sewn;
                    const atEmb = sent - back;
                    return (
                      <tr key={s.id} className="border-t border-line">
                        <td className="nums px-3 py-2.5 font-semibold">
                          {s.sizeLabel}
                        </td>
                        <td className="nums px-2 py-2.5 text-right text-muted">
                          {s.targetQty}
                        </td>
                        <td className="nums px-2 py-2.5 text-right font-medium">
                          {sewn}
                        </td>
                        <td
                          className={`nums px-2 py-2.5 text-right font-semibold ${
                            short > 0 ? "text-short" : "text-ok"
                          }`}
                        >
                          {short > 0 ? short : "✓"}
                        </td>
                        <td className="nums px-2 py-2.5 text-right text-muted">
                          {sent}
                        </td>
                        <td className="nums px-2 py-2.5 text-right text-muted">
                          {back}
                        </td>
                        <td
                          className={`nums px-3 py-2.5 text-right font-semibold ${
                            atEmb > 0 ? "text-warn" : "text-faint"
                          }`}
                        >
                          {atEmb > 0 ? atEmb : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {detail.categories.length === 0 && (
        <p className="text-sm text-muted">Chưa có dữ liệu.</p>
      )}
    </div>
  );
}
