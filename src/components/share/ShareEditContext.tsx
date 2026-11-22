"use client";

import { createContext, useContext } from "react";

const ShareEditContext = createContext(false);

/** Oturumdaki kişi Paylaşım Takvimi'ni düzenleyebiliyor mu (admin ya da düzenleme yetkisi verilenler).
 * İş ekranlarında "Paylaşım takvimine gönder" seçeneğini göstermek için kullanılır. */
export function ShareEditProvider({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  return <ShareEditContext.Provider value={canEdit}>{children}</ShareEditContext.Provider>;
}

export const useCanEditShareCalendar = () => useContext(ShareEditContext);
