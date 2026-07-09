"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export default function FormModal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          // Không tự đóng khi bấm ra ngoài: form dài, tránh mất dữ liệu đang nhập
          onPointerDownOutside={(e) => e.preventDefault()}
          className="anim-pop fixed inset-x-0 bottom-0 top-0 z-50 mx-auto flex w-full flex-col border-line bg-paper outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[88dvh] sm:w-[calc(100vw-3rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-4 py-3 pt-safe sm:px-5 sm:pt-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold sm:text-lg">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 truncate text-xs text-muted">
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

          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-safe sm:px-5">
            {children}
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
