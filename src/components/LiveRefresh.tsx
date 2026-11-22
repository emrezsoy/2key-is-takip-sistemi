"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Sunucu bileşenlerini periyodik olarak yeniden getirir; böylece başka bir
// kullanıcının yaptığı değişiklik (görev taşıma, puantaj işaretleme vb.)
// sayfa yenilenmeden panelde görünür. Client bileşenlerin state'i korunur,
// sadece sunucudan gelen veriler tazelenir.
export function LiveRefresh({ intervalMs = 4000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
