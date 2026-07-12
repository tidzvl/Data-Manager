"use client";

import { createContext, useContext } from "react";

/**
 * Bật tông "trang tính" cho các dialog lồng bên trong.
 *
 * PromptDialog/ConfirmDialog portal ra `body` nên nằm ngoài card về mặt DOM,
 * nhưng vẫn nằm trong cây React — context xuyên qua Portal, nên không phải
 * luồn prop `sheet` qua LinesManager/CatalogManager/OrderForm.
 */
const SheetCtx = createContext(false);

export const SheetProvider = SheetCtx.Provider;
export const useSheet = () => useContext(SheetCtx);

/** Lớp nền cho bề mặt nổi (dialog, popover) theo tông đang dùng. */
export function surfaceClass(sheet: boolean): string {
  return sheet ? "sheet-card" : "border border-line bg-surface";
}
