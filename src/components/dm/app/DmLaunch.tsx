"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DmIntro } from "./DmIntro";

export const DM_APP_PATH = "/mesaj";

/** Sistemden Mesaj Otomasyonu uygulamasına animasyonlu geçiş bağlantısı (mobil menüde). */
export function DmLaunch({ className, children, onStart }: { className?: string; children: React.ReactNode; onStart?: () => void }) {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    router.prefetch(DM_APP_PATH);
  }, [router]);

  useEffect(() => {
    if (!playing) return;
    // Animasyon bitmeye yakın yeni sayfaya geçilir; geçiş takılırsa sayfa doğrudan açılır.
    const go = setTimeout(() => router.push(DM_APP_PATH), 950);
    const fallback = setTimeout(() => window.location.assign(DM_APP_PATH), 9000);
    return () => {
      clearTimeout(go);
      clearTimeout(fallback);
    };
  }, [playing, router]);

  return (
    <>
      <a
        href={DM_APP_PATH}
        className={className}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey) return;
          e.preventDefault();
          if (playing) return;
          try {
            sessionStorage.setItem("dm-intro", "1");
          } catch {}
          onStart?.();
          setPlaying(true);
        }}
      >
        {children}
      </a>
      {playing && <DmIntro mode="in" />}
    </>
  );
}
