"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

export function Menu({
  trigger,
  children,
  align = "end",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={6}
          className="anim-pop z-50 min-w-44 overflow-hidden rounded-xl border border-line bg-surface-2 p-1 shadow-xl shadow-black/40"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({
  onSelect,
  children,
  icon,
  danger,
}: {
  onSelect: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={`flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-surface ${
        danger ? "text-short" : "text-ink"
      }`}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}
