"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardCheck, Menu, MessageCircle, Package, Store } from "lucide-react";
import { useDmLive } from "../inbox/useDmLive";
import { DmIntro, type IntroMode } from "./DmIntro";

type Theme = "dark" | "light";
const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({ theme: "dark", setTheme: () => {} });
export const useDmTheme = () => useContext(ThemeCtx);

type NavItem = { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; badge?: number };

/** "Sisteme dön": mesaj uygulamasını varsayılan açılış olmaktan çıkarıp müşteri paneline döner. */
export function leaveDmApp() {
  document.cookie = "dm_home=; path=/; max-age=0; samesite=lax";
  window.location.assign("/panel");
}

/**
 * Mesaj Otomasyonu uygulaması: sistemin içinde ayrı bir uygulama gibi (WhatsApp benzeri alt menü, varsayılan gece modu).
 * Telefonda bir kez açılınca sonraki girişler doğrudan buraya iner (dm_home çerezi; "Sisteme dön" ile silinir).
 */
export function DmAppShell({
  clientId,
  modules,
  unread,
  pending,
  children,
}: {
  clientId: string;
  modules: { appointment: boolean; products: boolean };
  unread: number;
  pending: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<Theme>("dark");
  // İlk boyamada ekran kapalı başlar (açılış / geçiş animasyonu gerekip gerekmediği tarayıcıda anlaşılır).
  const [intro, setIntro] = useState<IntroMode | "cover" | null>("cover");
  const decided = useRef(false);
  useDmLive(clientId);

  useEffect(() => {
    if (decided.current) return; // geliştirme modunda efektler iki kez çalışır; karar bir kez verilir
    decided.current = true;
    // Tema ve açılış animasyonu tarayıcı belleğine bağlı; sunucuda bilinemez, ilk boyamadan sonra bir kez okunur.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const saved = localStorage.getItem("dm-theme");
      if (saved === "light" || saved === "dark") setThemeState(saved);
    } catch {}
    document.cookie = "dm_home=1; path=/; max-age=31536000; samesite=lax";
    let next: IntroMode | null = null;
    try {
      if (sessionStorage.getItem("dm-intro") === "1") {
        sessionStorage.removeItem("dm-intro");
        next = "out";
      } else if (!sessionStorage.getItem("dm-splash")) {
        next = "splash";
      }
      sessionStorage.setItem("dm-splash", "1");
    } catch {}
    setIntro(next);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("dm-theme", t);
    } catch {}
  }, []);

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "dark" ? "#0a0a0a" : "#ffffff");
    // Telefonda sayfa kenarından taşınca (bounce) görünen zemin de uygulamanın renginde olsun.
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = theme === "dark" ? "#0a0a0a" : "#f6f6f7";
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, [theme]);

  const inChat = pathname.startsWith("/mesaj/s/");
  const nav: NavItem[] = [
    { href: "/mesaj", label: "Sohbetler", icon: MessageCircle, badge: unread },
    { href: "/mesaj/bekleyen", label: "Bekleyen", icon: ClipboardCheck, badge: pending },
    ...(modules.appointment
      ? [{ href: "/mesaj/randevular", label: "Randevular", icon: CalendarDays }]
      : modules.products
        ? [{ href: "/mesaj/urunler", label: "Ürünler", icon: Package }]
        : []),
    { href: "/mesaj/isletme", label: "İşletme", icon: Store },
    { href: "/mesaj/daha", label: "Daha", icon: Menu },
  ];
  const active = (href: string) => (href === "/mesaj" ? pathname === "/mesaj" || inChat : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <div className={`${theme === "dark" ? "dark" : ""} min-h-dvh bg-(--color-bg) text-(--color-text)`} style={{ colorScheme: theme }}>
        <div className={`mx-auto min-h-dvh w-full max-w-3xl ${inChat ? "" : "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"}`}>{children}</div>

        {!inChat && (
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-border) bg-(--color-surface)/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
            <div className="mx-auto grid max-w-3xl" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
              {nav.map((item) => {
                const Icon = item.icon;
                const on = active(item.href);
                return (
                  <Link key={item.href} href={item.href} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${on ? "text-brand-500" : "text-(--color-text-muted)"}`}>
                    <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${on ? "bg-brand-500/15" : ""}`}>
                      <Icon size={21} strokeWidth={on ? 2.4 : 2} />
                    </span>
                    {item.label}
                    {!!item.badge && item.badge > 0 && (
                      <span className="absolute left-1/2 top-1 ml-2 min-w-[1.1rem] rounded-full bg-brand-500 px-1 text-center text-[10px] font-bold leading-[1.1rem] text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        {intro === "cover" && <div className="fixed inset-0 z-[100] bg-[#050505]" aria-hidden="true" />}
        {intro && intro !== "cover" && <DmIntro mode={intro} covered={intro === "splash"} onDone={() => setIntro(null)} />}
      </div>
    </ThemeCtx.Provider>
  );
}
