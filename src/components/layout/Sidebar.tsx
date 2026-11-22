"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import type { Role } from "@prisma/client";
import { signOutAction } from "@/app/(app)/actions";
import { navFor, type NavAccess } from "./nav-items";

export function Sidebar({
  role,
  access,
  badges = {},
}: {
  role: Role;
  access: NavAccess;
  /** Menü öğesi adresi -> bekleyen sayı (kırmızı rozet). */
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const items = navFor(role, access);

  return (
    <aside className="sticky top-0 hidden h-dvh self-start lg:flex w-64 shrink-0 flex-col overflow-y-auto bg-(--color-sidebar) text-(--color-sidebar-text) border-r border-(--color-sidebar-border)">
      <div className="flex items-center px-6 py-6">
        <Image
          src="/brand/logo.png"
          alt="2 Key idea"
          width={1517}
          height={695}
          className="h-10 w-auto"
          priority
        />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors border-l-2 ${
                active
                  ? "bg-white/5 border-brand-500 text-white"
                  : "border-transparent text-(--color-sidebar-muted) hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={18} />
              {item.label}
              {(badges[item.href] ?? 0) > 0 && (
                <span
                  aria-label={`${badges[item.href]} bekleyen`}
                  className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold leading-none text-white"
                >
                  {badges[item.href] > 99 ? "99+" : badges[item.href]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-(--color-sidebar-muted) hover:bg-white/5 hover:text-white transition-colors"
          >
            <LogOut size={18} />
            Çıkış Yap
          </button>
        </form>
      </div>

      <div className="relative overflow-hidden px-6 py-6 border-t border-(--color-sidebar-border)">
        <p className="text-sm font-semibold italic text-(--color-sidebar-muted)">
          Aynı Dünya Farklı Fikir
        </p>
        <div className="pointer-events-none absolute -bottom-6 -right-8 h-24 w-24 rounded-full bg-brand-600/20" />
      </div>
    </aside>
  );
}
