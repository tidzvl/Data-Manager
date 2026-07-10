"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { GlassProvider } from "./glass-context";

export default function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  /** Tông kính, dùng cho các modal mở từ bảng LSX trên desktop. */
  glass,
  /** Card rộng hơn — cho các bảng nhiều cột. */
  wide,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  glass?: boolean;
  wide?: boolean;
}) {
  // .glass-card tự khai báo token của nó, không cần .glass-scope.
  const card = glass
    ? "glass-card sm:rounded-2xl"
    : "bg-paper sm:rounded-2xl sm:border sm:border-line sm:shadow-2xl sm:shadow-black/40";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={`anim-overlay fixed inset-0 z-50 backdrop-blur-sm ${
            glass ? "bg-black/50" : "bg-black/60"
          }`}
        />

        {/* Content phủ toàn màn và căn giữa card bằng flex — không dùng
            translate để định vị, nên animation không đá nhau với transform. */}
        <Dialog.Content
          // Form dài, bấm nhầm ra ngoài mà mất dữ liệu đang nhập thì tệ
          onPointerDownOutside={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex outline-none sm:items-center sm:justify-center sm:p-6"
        >
          <div
            className={`anim-dialog flex h-full w-full min-w-0 flex-col overflow-hidden sm:h-auto sm:max-h-[88dvh] ${
              wide ? "sm:max-w-6xl" : "sm:max-w-3xl"
            } ${card}`}
          >
            {/* Không dùng .pt-safe ở đây: nó là CSS thường nên đè cả biến thể
                sm: của Tailwind, khiến padding-top về 0 trên desktop. */}
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 pb-3.5 pt-[calc(env(safe-area-inset-top)+1.125rem)] sm:px-5 sm:pb-4 sm:pt-5">
              <div className="min-w-0">
                <Dialog.Title className="truncate text-base font-semibold sm:text-lg">
                  {title}
                </Dialog.Title>
                {description ? (
                  <Dialog.Description className="truncate text-xs text-muted">
                    {description}
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="sr-only">
                    {title}
                  </Dialog.Description>
                )}
              </div>
              <Dialog.Close asChild>
                <button
                  aria-label="Đóng"
                  className="tap -mr-2 flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-ink sm:h-9 sm:w-9 sm:min-h-0 sm:min-w-0"
                >
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>

            {/* overflow-x-hidden: chặn các phần tử -mx- bên trong tràn ngang.
                Vùng cuộn ngang riêng (.xscroll) vẫn hoạt động bình thường. */}
            <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-5 sm:pb-4">
              <GlassProvider value={!!glass}>{children}</GlassProvider>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Khung chờ trong lúc nạp dữ liệu form. */
export function FormSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-xl border border-line bg-surface"
        />
      ))}
    </div>
  );
}
