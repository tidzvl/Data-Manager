"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { surfaceClass, useSheet } from "./sheet-context";

export default function PromptDialog({
  open,
  onOpenChange,
  title,
  placeholder,
  defaultValue = "",
  confirmLabel = "Lưu",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
}) {
  const sheet = useSheet();
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={`anim-pop-center fixed left-1/2 top-1/3 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl p-5 shadow-2xl outline-none ${surfaceClass(sheet)}`}
        >
          <Dialog.Title className="font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={placeholder}
            className="tap mt-3 w-full rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand-line"
          />
          <div className="mt-4 flex gap-2">
            <Dialog.Close asChild>
              <button className="tap flex-1 rounded-xl border border-line font-medium text-muted active:bg-surface-2">
                Huỷ
              </button>
            </Dialog.Close>
            <button
              onClick={submit}
              className="tap flex-1 rounded-xl bg-brand font-semibold text-brand-fg"
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
