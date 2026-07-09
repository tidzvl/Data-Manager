"use client";

import { Drawer } from "vaul";

export default function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col rounded-t-2xl border border-line bg-surface pb-safe outline-none">
          <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-line" />
          <div className="px-4 pb-2 pt-3">
            {title && (
              <Drawer.Title className="text-base font-semibold">
                {title}
              </Drawer.Title>
            )}
            {description ? (
              <Drawer.Description className="mt-0.5 text-sm text-muted">
                {description}
              </Drawer.Description>
            ) : (
              <Drawer.Description className="sr-only">{title}</Drawer.Description>
            )}
          </div>
          <div className="max-h-[78dvh] overflow-y-auto px-4 pb-4">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
