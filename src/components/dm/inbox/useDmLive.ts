"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Canlı akış: yeni mesaj / değişiklik gelince sayfa verisini yeniler (kısa süre içinde gelenleri tek yenilemede toplar). */
export function useDmLive(clientId: string) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const es = new EventSource(`/api/dm/stream?clientId=${encodeURIComponent(clientId)}`);
    es.onmessage = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 250);
    };
    return () => {
      es.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [clientId, router]);
}
