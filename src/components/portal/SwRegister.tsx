"use client";

import { useEffect } from "react";

/** Service worker'ı kaydeder (uygulama olarak kurulabilirlik ve telefona bildirim için). */
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
  }, []);
  return null;
}
