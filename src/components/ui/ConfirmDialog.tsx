"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { surfaceClass, useSheet } from "./sheet-context";

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  danger,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
}) {
  const sheet = useSheet();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={`anim-pop-center fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-5 shadow-2xl outline-none ${surfaceClass(sheet)}`}
        >
          <div className="flex items-start gap-3">
            {danger && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-short-soft text-short">
                <AlertTriangle size={18} />
              </span>
            )}
            <div className="min-w-0">
              <Dialog.Title className="font-semibold">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Dialog.Close asChild>
              <button className="tap flex-1 rounded-xl border border-line font-medium text-muted active:bg-surface-2">
                {cancelLabel}
              </button>
            </Dialog.Close>
            <button
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              className={`tap flex-1 rounded-xl font-semibold ${
                danger
                  ? "bg-short text-white"
                  : "bg-brand text-brand-fg"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
