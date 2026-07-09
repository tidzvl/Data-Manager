import type { OrderDetail } from "@/lib/aggregate";
import { ps } from "@/lib/keys";

/**
 * Ma trận thật: hàng = chi tiết, cột = size. Mỗi ô là "đã xuất / cần xuất".
 * Chỉ khả thi trên màn rộng — bản mobile dùng accordion.
 */
export default function PartsMatrixTable({ detail }: { detail: OrderDetail }) {
  if (detail.categories.length === 0)
    return <Empty>Chưa có phân loại nào.</Empty>;

  return (
    <div className="space-y-5">
      {detail.categories.map((c) => {
        if (c.parts.length === 0)
          return (
            <Section key={c.id} title={c.name}>
              <Empty>Chưa khai báo chi tiết.</Empty>
            </Section>
          );

        // Tổng theo cột (từng size) để có hàng chân bảng
        const colTotals = c.sizes.map((s) => {
          let done = 0;
          let target = 0;
          for (const p of c.parts) {
            done += detail.sewOut[ps(p.id, s.id)] ?? 0;
            target += p.targets[s.id] ?? 0;
          }
          return { done, target };
        });

        return (
          <Section key={c.id} title={c.name}>
            <div className="thin-scroll overflow-x-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th className="min-w-[12rem]">Chi tiết</th>
                    {c.sizes.map((s) => (
                      <th key={s.id} className="!text-right">
                        {s.sizeLabel}
                      </th>
                    ))}
                    <th className="!text-right">Tổng</th>
                  </tr>
                </thead>
                <tbody>
                  {c.parts.map((p) => {
                    let rowDone = 0;
                    let rowTarget = 0;
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{
                                background: p.color ?? "var(--color-faint)",
                              }}
                            />
                            <span className="truncate font-medium">
                              {p.name}
                            </span>
                          </span>
                        </td>
                        {c.sizes.map((s) => {
                          const done = detail.sewOut[ps(p.id, s.id)] ?? 0;
                          const target = p.targets[s.id] ?? 0;
                          rowDone += done;
                          rowTarget += target;
                          return (
                            <td key={s.id} className="num">
                              <Cell done={done} target={target} />
                            </td>
                          );
                        })}
                        <td className="num">
                          <Cell done={rowDone} target={rowTarget} bold />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-surface-2">
                    <td className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-faint">
                      Tổng cột
                    </td>
                    {colTotals.map((t, i) => (
                      <td key={i} className="num px-3 py-2">
                        <Cell done={t.done} target={t.target} bold />
                      </td>
                    ))}
                    <td className="num px-3 py-2">
                      <Cell
                        done={colTotals.reduce((a, t) => a + t.done, 0)}
                        target={colTotals.reduce((a, t) => a + t.target, 0)}
                        bold
                      />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>
        );
      })}
    </div>
  );
}

function Cell({
  done,
  target,
  bold,
}: {
  done: number;
  target: number;
  bold?: boolean;
}) {
  if (target === 0 && done === 0)
    return <span className="text-faint">—</span>;
  const complete = done >= target;
  return (
    <span className={bold ? "font-semibold" : undefined}>
      <span className={complete ? "text-ok" : "text-ink"}>{done}</span>
      <span className="text-faint">/{target}</span>
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="border-b border-line px-3 py-2 text-sm font-semibold">
        {title}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-8 text-center text-sm text-muted">{children}</p>;
}
