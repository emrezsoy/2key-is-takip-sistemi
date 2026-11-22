"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarHeart,
  ClipboardList,
  FilePenLine,
  Home,
  ListChecks,
  LogOut,
  Megaphone,
  FileText,
  TrendingUp,
  Moon,
  Sun,
  MoreHorizontal,
  UserCog,
  Wallet,
  X,
} from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { useTheme } from "next-themes";
import { NotificationsBell, type NotificationItem } from "@/components/layout/NotificationsBell";

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };

const ITEMS: Item[] = [
  { href: "/panel", label: "Özet", icon: Home },
  { href: "/panel/isler", label: "İşlerim", icon: ListChecks },
  { href: "/panel/talepler", label: "Talepler", icon: ClipboardList },
  { href: "/panel/icerik", label: "İçerik", icon: FilePenLine },
  { href: "/panel/reklamlar", label: "Reklamlar", icon: Megaphone },
  { href: "/panel/gelisim", label: "Gelişim", icon: TrendingUp },
  { href: "/panel/rapor", label: "Raporlar", icon: FileText },
  { href: "/panel/takvim", label: "Paylaşım Takvimi", icon: CalendarHeart },
  { href: "/panel/odemeler", label: "Ödemeler", icon: Wallet },
  { href: "/panel/hesabim", label: "Hesabım", icon: UserCog },
];

const isActive = (pathname: string, href: string) =>
  href === "/panel" ? pathname === "/panel" : pathname === href || pathname.startsWith(`${href}/`);

export function PortalShell({
  clientName,
  fullName,
  notifications,
  unreadCount,
  overdue,
  growth = false,
  reports = false,
  children,
}: {
  clientName: string;
  fullName: string;
  notifications: NotificationItem[];
  unreadCount: number;
  overdue: boolean;
  /** Yönetici bu müşteri için "Gelişim" sayfasını açtıysa menüde görünür. */
  growth?: boolean;
  /** Müşteriye gönderilmiş aylık rapor varsa menüde görünür. */
  reports?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [more, setMore] = useState(false);
  const items = ITEMS.filter((i) => (i.href !== "/panel/gelisim" || growth) && (i.href !== "/panel/rapor" || reports));
  const bottom = items.slice(0, 4);

  const badge = (href: string) =>
    href === "/panel/odemeler" && overdue ? (
      <span className="ml-auto h-2 w-2 rounded-full bg-brand-500" aria-label="Gecikmiş ödeme var" />
    ) : null;

  return (
    <div className="flex min-h-dvh w-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col self-start overflow-y-auto border-r border-(--color-sidebar-border) bg-(--color-sidebar) text-(--color-sidebar-text) lg:flex">
        <div className="px-6 py-6">
          <Image src="/brand/logo.png" alt="2 Key idea" width={1517} height={695} className="h-10 w-auto" priority />
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.href}
                className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-brand-500 bg-white/5 text-white"
                    : "border-transparent text-(--color-sidebar-muted) hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon size={18} />
                {item.label}
                {badge(item.href)}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 pb-4">
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-(--color-sidebar-muted) transition-colors hover:bg-white/5 hover:text-white"
            >
              <LogOut size={18} />
              Çıkış Yap
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-(--color-border) bg-(--color-surface) px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <span className="shrink-0 lg:hidden">
            <Image src="/brand/logo-dark.png" alt="2 Key idea" width={751} height={345} className="h-8 w-auto dark:hidden" />
            <Image src="/brand/logo.png" alt="2 Key idea" width={1517} height={695} className="hidden h-8 w-auto dark:block" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{clientName}</p>
            <p className="truncate text-xs leading-tight text-(--color-text-muted)">{fullName}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full p-2 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
              aria-label="Temayı değiştir"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <NotificationsBell notifications={notifications} unreadCount={unreadCount} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-(--color-bg) p-4 pb-24 sm:p-6 lg:pb-6">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-(--color-border) bg-(--color-surface) pb-[env(safe-area-inset-bottom)] lg:hidden">
        {bottom.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? "text-brand-600" : "text-(--color-text-muted)"
              }`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMore(true)}
          className="relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-(--color-text-muted)"
        >
          <MoreHorizontal size={20} />
          Daha fazla
          {overdue && <span className="absolute right-5 top-1.5 h-2 w-2 rounded-full bg-brand-500" />}
        </button>
      </nav>

      {more && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-(--color-surface) p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-bold">Menü</p>
              <button type="button" onClick={() => setMore(false)} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.slice(4).map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMore(false)}
                    className="relative flex flex-col items-center gap-1 rounded-xl border border-(--color-border) py-3 text-[11px] font-medium"
                  >
                    <Icon size={20} />
                    {item.label}
                    {item.href === "/panel/odemeler" && overdue && (
                      <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-brand-500" />
                    )}
                  </Link>
                );
              })}
            </div>
            <form action={signOutAction} className="mt-3">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-(--color-border) py-2.5 text-sm font-medium text-(--color-text-muted)"
              >
                <LogOut size={16} />
                Çıkış Yap
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
