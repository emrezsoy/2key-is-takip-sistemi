"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { ChevronDown, Moon, Search, Sun } from "lucide-react";
import type { Role } from "@prisma/client";
import { ROLE_LABEL } from "@/lib/format";
import { MobileNav } from "./MobileNav";
import type { NavAccess } from "./nav-items";
import { NotificationsBell, type NotificationItem } from "./NotificationsBell";

export function Topbar({
  fullName,
  role,
  navAccess,
  navBadges,
  avatarUrl,
  notifications,
  unreadCount,
}: {
  fullName: string;
  role: Role;
  navAccess: NavAccess;
  navBadges?: Record<string, number>;
  avatarUrl?: string | null;
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const initial = fullName.trim().charAt(0).toUpperCase();

  return (
    <header className="flex items-center gap-2 border-b border-(--color-border) bg-(--color-surface) px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-4 sm:px-6">
      <MobileNav role={role} access={navAccess} badges={navBadges} />

      <div className="relative hidden min-w-0 max-w-xl flex-1 sm:block">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-muted)"
        />
        <input
          type="text"
          placeholder="Görev, müşteri veya çalışan ara..."
          className="w-full rounded-lg border border-(--color-border) bg-(--color-surface-muted) py-2 pl-9 pr-9 text-sm outline-none focus:border-brand-500"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-(--color-border) px-1.5 py-0.5 text-[10px] text-(--color-text-muted) sm:block">
          /
        </kbd>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-full p-2 text-(--color-text-muted) hover:bg-(--color-surface-muted)"
          aria-label="Temayı değiştir"
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <NotificationsBell notifications={notifications} unreadCount={unreadCount} />

        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-(--color-surface-muted) sm:px-2"
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={fullName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                {initial}
              </span>
            )}
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-semibold leading-tight">{fullName}</span>
              <span className="block text-xs text-(--color-text-muted) leading-tight">
                {ROLE_LABEL[role] ?? role}
              </span>
            </span>
            <ChevronDown size={16} className="hidden text-(--color-text-muted) sm:block" />
          </button>

          {open && (
            <div
              className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-(--color-border) bg-(--color-surface) py-1 shadow-card"
              onMouseLeave={() => setOpen(false)}
            >
              <a
                href="/profil"
                className="block px-3 py-2 text-sm hover:bg-(--color-surface-muted)"
              >
                Profilim
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
