"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, LogOut, MoreHorizontal, User, X } from "lucide-react";
import type { Role } from "@prisma/client";
import { signOutAction } from "@/app/(app)/actions";
import { navFor, type NavAccess, type NavItem } from "./nav-items";

// Alt çubukta öncelikle bu sayfalar görünür (rol başına), kalanlar "Daha fazla" menüsüne girer.
const BOTTOM_PRIORITY: Record<string, string[]> = {
  ADMIN: ["/", "/musteriler", "/talepler", "/finans"],
  SUPERVISOR: ["/", "/ekibim", "/paylasim-takvimi", "/rapor"],
  EMPLOYEE: ["/", "/calisma-planim", "/paylasim-takvimi", "/profil"],
};

// Alt çubukta sığması için kısa adlar.
const SHORT_LABEL: Record<string, string> = {
  "Müşteri Talepleri": "Talepler",
  "Paylaşım Takvimi": "Takvim",
  "Çalışma Planım": "Planım",
  "Reklam Paneli": "Reklam",
};

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

/** Telefonda uygulama gibi görünüm: üstte logo, altta sekme çubuğu, "Daha fazla" menüsü. (lg ve üstünde gizli.) */
export function MobileNav({
  role,
  access,
  badges = {},
}: {
  role: Role;
  access: NavAccess;
  /** Menü öğesi adresi -> bekleyen sayı (kırmızı rozet). */
  badges?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = navFor(role, access);

  const preferred = (BOTTOM_PRIORITY[role] ?? [])
    .map((href) => items.find((i) => i.href === href))
    .filter((i): i is NavItem => !!i);
  const bottom = [...preferred, ...items.filter((i) => !preferred.includes(i))].slice(0, 4);
  const rest = items.filter((i) => !bottom.includes(i));

  return (
    <>
      <Link href="/" aria-label="Ana sayfa" className="shrink-0 lg:hidden">
        <Image src="/brand/logo-dark.png" alt="2 Key idea" width={751} height={345} className="h-8 w-auto dark:hidden" priority />
        <Image src="/brand/logo.png" alt="2 Key idea" width={1517} height={695} className="hidden h-8 w-auto dark:block" priority />
      </Link>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-(--color-border) bg-(--color-surface) pb-[env(safe-area-inset-bottom)] lg:hidden">
        {bottom.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-0.5 px-0.5 py-2 text-center text-[10px] font-medium leading-tight ${
                active ? "text-brand-600" : "text-(--color-text-muted)"
              }`}
            >
              <span className="relative">
                <Icon size={20} />
                {(badges[item.href] ?? 0) > 0 && (
                  <span
                    aria-label={`${badges[item.href]} bekleyen`}
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white"
                  >
                    {badges[item.href] > 99 ? "99+" : badges[item.href]}
                  </span>
                )}
              </span>
              <span>{SHORT_LABEL[item.label] ?? item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-(--color-text-muted)"
        >
          <MoreHorizontal size={20} />
          Daha fazla
        </button>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-(--color-surface) p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold">Menü</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Kapat">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {rest.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-3 text-center text-[11px] font-medium ${
                      isActive(pathname, item.href)
                        ? "border-brand-500 text-brand-600"
                        : "border-(--color-border)"
                    }`}
                  >
                    <span className="relative">
                      <Icon size={20} />
                      {(badges[item.href] ?? 0) > 0 && (
                        <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold leading-none text-white">
                          {badges[item.href] > 99 ? "99+" : badges[item.href]}
                        </span>
                      )}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/profil"
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1 rounded-xl border border-(--color-border) py-3 text-center text-[11px] font-medium"
              >
                <User size={20} />
                Profil
              </Link>
              <Link
                href="/profil#uygulama"
                onClick={() => setOpen(false)}
                className="flex flex-col items-center gap-1 rounded-xl border border-(--color-border) py-3 text-center text-[11px] font-medium"
              >
                <Download size={20} />
                Uygulamayı yükle
              </Link>
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
    </>
  );
}
