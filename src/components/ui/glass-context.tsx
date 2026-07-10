"use client";

import { createContext, useContext } from "react";

/**
 * Bật tông kính cho các dialog lồng bên trong.
 *
 * PromptDialog/ConfirmDialog portal ra `body` nên nằm ngoài card về mặt DOM,
 * nhưng vẫn nằm trong cây React — context xuyên qua Portal, nên không phải
 * luồn prop `glass` qua LinesManager/CatalogManager/OrderForm.
 */
const GlassCtx = createContext(false);

export const GlassProvider = GlassCtx.Provider;
export const useGlass = () => useContext(GlassCtx);

/** Lớp nền cho bề mặt nổi (dialog, popover) theo tông đang dùng. */
export function surfaceClass(glass: boolean): string {
  return glass ? "glass-card" : "border border-line bg-surface";
}
