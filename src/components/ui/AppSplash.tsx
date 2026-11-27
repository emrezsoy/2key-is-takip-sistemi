"use client";

import { useEffect, useState } from "react";
import { DmIntro } from "@/components/dm/app/DmIntro";

/**
 * İlk boyamadan önce çalışır (root layout, beforeInteractive): bu sekmede açılış animasyonu henüz oynamadıysa
 * ekranı kaplar ve kararı window.__appSplash'e yazar. Karar animasyon bitene kadar silinmez; böylece React
 * ilk yüklemede bileşeni yeniden kursa bile animasyon kaybolmaz.
 */
export const SPLASH_BOOT_SCRIPT = `try{var p=location.pathname;if(!/^\\/(mesaj|radyo-tv)(\\/|$)/.test(p)&&!sessionStorage.getItem("app-splash")){var c=document.documentElement.classList,d=localStorage.getItem("theme")==="dark";c.add("splash-pending");if(d)c.add("splash-dark");window.__appSplash=d?"dark":"light";sessionStorage.setItem("app-splash","1");}}catch(e){}`;

declare global {
  interface Window {
    __appSplash?: "dark" | "light";
  }
}

/**
 * Sistemin açılış animasyonu (telefonda ve bilgisayarda): her yeni açılışta (sekme/uygulama) bir kez oynar,
 * sistem içinde sayfa değiştirirken oynamaz. Gündüz modunda açık zeminli, gece modunda koyu zeminli.
 * Mesaj Otomasyonu (/mesaj) kendi animasyonunu oynatır.
 */
export function AppSplash() {
  const [variant, setVariant] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    const v = window.__appSplash;
    if (!v) return;
    // Tarayıcıdaki karara bağlı: sunucuda bilinemez, ilk boyamadan sonra okunur.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariant(v);
  }, []);

  // Animasyon ekrana gelince (örtünün üstünde, aynı renkte başlar) düz örtü kaldırılır; solarken sayfa görünür.
  useEffect(() => {
    if (variant) document.documentElement.classList.remove("splash-pending", "splash-dark");
  }, [variant]);

  if (!variant) return null;
  return (
    <DmIntro
      mode="splash"
      covered
      variant={variant}
      onDone={() => {
        // Animasyon örtünün üstünde oynar; bitince örtü de kalkar.
        delete window.__appSplash;
        document.documentElement.classList.remove("splash-pending", "splash-dark");
        setVariant(null);
      }}
    />
  );
}
