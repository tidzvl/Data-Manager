"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUp, ArrowDown, ChevronsUpDown, SearchX, PackagePlus } from "lucide-react";
import type { OrderSummary } from "@/lib/aggregate";
import { pct } from "@/components/ProgressBar";

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type SortKey = "createdAt" | "code" | "productName" | "line" | "status";

const COLUMNS: {
  key: string;
  label: string;
  sort?: SortKey;
  align?: "right";
}[] = [
  { key: "code", label: "Mã LSX", sort: "code" },
  { key: "productName", label: "Sản phẩm", sort: "productName" },
  { key: "line", label: "Chuyền may", sort: "line" },
  { key: "createdAt", label: "Ngày tạo", sort: "createdAt" },
  { key: "detail", label: "Chi tiết xuất", align: "right" },
  { key: "sewn", label: "Đã may", align: "right" },
  { key: "emb", label: "Ở thêu", align: "right" },
  { key: "status", label: "Trạng thái", sort: "status" },
];

export default function OrdersTable({
  orders,
  sort,
  dir,
  sortHrefs,
  searching,
}: {
  orders: OrderSummary[];
  sort: SortKey;
  dir: "asc" | "desc";
  /**
   * URL dựng sẵn ở server cho mỗi cột (bấm vào là đảo chiều sắp xếp).
   * Không truyền hàm được vì đây là Client Component.
   */
  sortHrefs: Record<SortKey, string>;
  searching: boolean;
}) {
  const router = useRouter();

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line py-20 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-line bg-surface text-faint">
          {searching ? <SearchX size={30} /> : <PackagePlus size={30} />}
        </span>
        <p className="text-muted">
          {searching
            ? "Không tìm thấy lệnh sản xuất nào."
            : "Chưa có lệnh sản xuất nào."}
        </p>
        {!searching && (
          <Link
            href="/lsx/new"
            className="mt-5 rounded-xl bg-brand px-5 py-2.5 font-semibold text-brand-fg"
          >
            + Tạo LSX đầu tiên
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="dt-scroll thin-scroll max-h-[calc(100dvh-var(--topbar-h)-17rem)] overflow-auto">
        <table className="dt">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={c.align === "right" ? "!text-right" : undefined}
                >
                  {c.sort ? (
                    <SortLink
                      label={c.label}
                      active={sort === c.sort}
                      dir={dir}
                      href={sortHrefs[c.sort]}
                    />
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o, i) => {
              const detailPct = pct(o.progress.detailDone, o.progress.detailTarget);
              const sewnPct = pct(o.progress.sewnDone, o.progress.sewnTarget);
              return (
                <motion.tr
                  key={o.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.02, 0.2) }}
                  onClick={() => router.push(`/lsx/${o.id}`)}
                  className="cursor-pointer"
                >
                  <td>
                    <Link
                      href={`/lsx/${o.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="nums font-semibold text-brand hover:underline"
                    >
                      {o.code}
                    </Link>
                  </td>
                  <td className="max-w-[22rem] truncate">{o.productName}</td>
                  <td className="text-muted">
                    {o.lineName ?? (
                      <span className="text-faint">chưa gán</span>
                    )}
                  </td>
                  <td className="nums text-muted">{formatDate(o.createdAt)}</td>

                  <td>
                    <MiniMeter
                      done={o.progress.detailDone}
                      target={o.progress.detailTarget}
                      percent={detailPct}
                    />
                  </td>
                  <td>
                    <MiniMeter
                      done={o.progress.sewnDone}
                      target={o.progress.sewnTarget}
                      percent={sewnPct}
                    />
                  </td>
                  <td className="num">
                    {o.progress.atEmbroidery > 0 ? (
                      <span className="rounded-md bg-warn-soft px-1.5 py-0.5 font-medium text-warn">
                        {o.progress.atEmbroidery}
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td>
                    {o.status === "DONE" ? (
                      <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-medium text-ok">
                        Hoàn thành
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_6px_var(--color-brand)]" />
                        Đang chạy
                      </span>
                    )}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortLink({
  label,
  active,
  dir,
  href,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  href: string;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`inline-flex items-center gap-1 transition-colors hover:text-ink ${
        active ? "text-brand" : ""
      }`}
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp size={12} />
        ) : (
          <ArrowDown size={12} />
        )
      ) : (
        <ChevronsUpDown size={12} className="opacity-40" />
      )}
    </Link>
  );
}

function MiniMeter({
  done,
  target,
  percent,
}: {
  done: number;
  target: number;
  percent: number;
}) {
  const complete = target > 0 && done >= target;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2 ring-1 ring-inset ring-line">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${percent}%`,
            background: complete
              ? "var(--color-ok)"
              : percent > 0
                ? "var(--color-brand)"
                : "transparent",
          }}
        />
      </div>
      <span className="nums w-24 text-right text-xs tabular-nums">
        <span className={complete ? "text-ok" : "text-ink"}>{done}</span>
        <span className="text-faint">/{target}</span>
      </span>
    </div>
  );
}
