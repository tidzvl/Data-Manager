"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";

export default function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);

  // Đồng bộ khi điều hướng bằng nút back/forward
  useEffect(() => setValue(initial), [initial]);

  // Debounce: chỉ đẩy vào URL sau khi ngừng gõ
  useEffect(() => {
    const t = setTimeout(() => {
      if (value === initial) return;
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value.trim());
      else next.delete("q");
      next.delete("page"); // đổi từ khoá thì về trang 1
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tìm mã LSX, tên sản phẩm, chuyền may…"
        className="tap w-full rounded-xl border border-line bg-surface pl-9 pr-9 text-sm outline-none focus:border-brand-line"
      />
      {value && (
        <button
          onClick={() => setValue("")}
          aria-label="Xoá tìm kiếm"
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-faint active:bg-surface-2"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
